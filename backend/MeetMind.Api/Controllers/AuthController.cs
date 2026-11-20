using System;
using System.Collections.Concurrent;
using System.Collections.Generic;
using System.IdentityModel.Tokens.Jwt;
using System.Net.Http;
using System.Security.Claims;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using System.Text.RegularExpressions;
using System.Threading.Tasks;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.IdentityModel.Tokens;
using MeetMind.Api.Services;
using MeetMind.Core.Entities;
using MeetMind.Core.Enums;
using MeetMind.Infrastructure.Data;

namespace MeetMind.Api.Controllers
{
    [ApiController]
    [Route("api/v1/auth")]
    public class AuthController : ControllerBase
    {
        private static readonly Regex EmailRegex = new(@"^[^\s@]+@[^\s@]+\.[^\s@]{2,}$", RegexOptions.Compiled);
        private static readonly ConcurrentDictionary<string, DateTime> RevokedJtis = new();
        private static readonly ConcurrentDictionary<string, RefreshSessionRecord> RefreshSessions = new();
        private static readonly ConcurrentDictionary<string, PasswordResetRecord> PasswordResets = new();

        private readonly ApplicationDbContext _db;
        private readonly IConfiguration _config;
        private readonly ICurrentUserService _currentUser;

        public AuthController(
            ApplicationDbContext db,
            IConfiguration config,
            ICurrentUserService currentUser)
        {
            _db = db;
            _config = config;
            _currentUser = currentUser;
        }

        public record LoginRequest(string Email, string Password, bool RememberMe = false);
        public record RegisterRequest(string Name, string Email, string Password, string? ConfirmPassword = null, string? Department = null);
        public record GoogleAuthRequest(string? IdToken, string? AccessToken);
        public record RefreshRequest(string? RefreshToken);
        public record ForgotPasswordRequest(string Email);
        public record ResetPasswordRequest(string Token, string NewPassword, string? ConfirmPassword = null);

        private sealed record RefreshSessionRecord(
            Guid UserId,
            string Email,
            string Name,
            string Role,
            bool IsGuest,
            bool RememberMe,
            DateTime ExpiresAtUtc);

        private sealed record PasswordResetRecord(Guid UserId, DateTime ExpiresAtUtc);

        [HttpGet("config")]
        [AllowAnonymous]
        public IActionResult GetConfig()
        {
            var googleClientId = GetGoogleClientId();
            var resendKey = Environment.GetEnvironmentVariable("RESEND_API_KEY") ?? _config["Email:ResendApiKey"];
            return Ok(new
            {
                googleEnabled = !string.IsNullOrWhiteSpace(googleClientId),
                googleClientId = string.IsNullOrWhiteSpace(googleClientId) ? null : googleClientId,
                passwordResetEmailConfigured = !string.IsNullOrWhiteSpace(resendKey)
            });
        }

        [HttpPost("register")]
        [AllowAnonymous]
        public async Task<IActionResult> Register([FromBody] RegisterRequest request)
        {
            var name = (request.Name ?? string.Empty).Trim();
            var email = NormalizeEmail(request.Email);
            var password = request.Password ?? string.Empty;

            if (name.Length < 2)
                return BadRequest(new { error = "Full name must be at least 2 characters long." });

            if (!EmailRegex.IsMatch(email))
                return BadRequest(new { error = "Invalid email address." });

            var strengthError = ValidatePasswordStrength(password);
            if (strengthError != null)
                return BadRequest(new { error = strengthError });

            if (request.ConfirmPassword != null && request.ConfirmPassword != password)
                return BadRequest(new { error = "Passwords do not match." });

            var exists = await _db.Users.AnyAsync(u => u.Email.ToLower() == email);
            if (exists)
                return Conflict(new { error = "Email already registered." });

            var user = new User
            {
                Id = Guid.NewGuid(),
                Name = name,
                Email = email,
                PasswordHash = HashPasswordPbkdf2(password),
                Role = UserRole.Member,
                Department = string.IsNullOrWhiteSpace(request.Department) ? "General" : request.Department.Trim(),
                CreatedAtUtc = DateTime.UtcNow
            };

            _db.Users.Add(user);
            await _db.SaveChangesAsync();

            var (token, expiresAt, refreshToken) = IssueSessionTokens(user.Id, user.Email, user.Name, user.Role.ToString(), isGuest: false, rememberMe: true);
            AppendAuthCookies(token, refreshToken, rememberMe: true, isGuest: false);

            return StatusCode(StatusCodes.Status201Created, new
            {
                token,
                expiresAt = expiresAt.ToString("O"),
                user = ToPublicUser(user, isGuest: false, provider: "local")
            });
        }

        [HttpPost("login")]
        [AllowAnonymous]
        public async Task<IActionResult> Login([FromBody] LoginRequest request)
        {
            var email = NormalizeEmail(request.Email);
            var password = request.Password ?? string.Empty;

            if (string.IsNullOrWhiteSpace(email) || string.IsNullOrWhiteSpace(password))
                return BadRequest(new { error = "Email and password are required." });

            if (!EmailRegex.IsMatch(email))
                return BadRequest(new { error = "Invalid email address." });

            var user = await _db.Users.FirstOrDefaultAsync(u => u.Email.ToLower() == email);
            if (user == null || string.IsNullOrWhiteSpace(user.PasswordHash))
                return Unauthorized(new { error = "Incorrect email or password." });

            if (!VerifyPasswordPbkdf2(password, user.PasswordHash))
                return Unauthorized(new { error = "Incorrect email or password." });

            var (token, expiresAt, refreshToken) = IssueSessionTokens(user.Id, user.Email, user.Name, user.Role.ToString(), isGuest: false, rememberMe: request.RememberMe);
            AppendAuthCookies(token, refreshToken, rememberMe: request.RememberMe, isGuest: false);

            return Ok(new
            {
                token,
                expiresAt = expiresAt.ToString("O"),
                user = ToPublicUser(user, isGuest: false, provider: "local")
            });
        }

        [HttpPost("google")]
        [AllowAnonymous]
        public async Task<IActionResult> GoogleSignIn([FromBody] GoogleAuthRequest request)
        {
            var googleClientId = GetGoogleClientId();
            if (string.IsNullOrWhiteSpace(googleClientId))
                return StatusCode(StatusCodes.Status503ServiceUnavailable, new { error = "Google Sign-In is not configured on this server." });

            var identity = await VerifyGoogleTokenAsync(request.IdToken, request.AccessToken, googleClientId);
            if (identity == null)
                return Unauthorized(new { error = "Google token verification failed. Please try signing in again." });

            var email = NormalizeEmail(identity.Value.Email);
            var user = await _db.Users.FirstOrDefaultAsync(u => u.Email.ToLower() == email);
            if (user == null)
            {
                user = new User
                {
                    Id = Guid.NewGuid(),
                    Email = email,
                    Name = string.IsNullOrWhiteSpace(identity.Value.Name) ? email.Split('@')[0] : identity.Value.Name,
                    PasswordHash = string.Empty,
                    Role = UserRole.Member,
                    Department = "Google Workspace",
                    CreatedAtUtc = DateTime.UtcNow
                };
                _db.Users.Add(user);
                await _db.SaveChangesAsync();
            }

            var (token, expiresAt, refreshToken) = IssueSessionTokens(user.Id, user.Email, user.Name, user.Role.ToString(), isGuest: false, rememberMe: true);
            AppendAuthCookies(token, refreshToken, rememberMe: true, isGuest: false);

            return Ok(new
            {
                token,
                expiresAt = expiresAt.ToString("O"),
                user = ToPublicUser(user, isGuest: false, provider: "google")
            });
        }

        [HttpPost("guest")]
        [AllowAnonymous]
        public IActionResult GuestSignIn()
        {
            var guestId = Guid.NewGuid();
            var shortCode = guestId.ToString("N")[..8];
            var guestEmail = $"guest+{shortCode}@session.meetmind.ai";

            var (token, expiresAt, refreshToken) = IssueSessionTokens(guestId, guestEmail, "Guest Explorer", "Guest", isGuest: true, rememberMe: false);
            AppendAuthCookies(token, refreshToken, rememberMe: false, isGuest: true);

            return Ok(new
            {
                token,
                expiresAt = expiresAt.ToString("O"),
                user = new
                {
                    id = guestId.ToString(),
                    email = guestEmail,
                    name = "Guest Explorer",
                    role = "guest",
                    authProvider = "guest",
                    isGuest = true,
                    emailVerified = false,
                    department = "Guest Session",
                    initials = "GE",
                    createdAt = DateTime.UtcNow.ToString("O")
                }
            });
        }

        [HttpPost("refresh")]
        [AllowAnonymous]
        public IActionResult Refresh([FromBody] RefreshRequest? request)
        {
            var rawRefresh = Request.Cookies["meetmind_refresh_token"] ?? request?.RefreshToken;
            if (string.IsNullOrWhiteSpace(rawRefresh))
                return Unauthorized(new { error = "Session expired. Please sign in again.", code = "TOKEN_EXPIRED" });

            var hash = ComputeSha256Hex(rawRefresh);
            if (!RefreshSessions.TryRemove(hash, out var session) || session.ExpiresAtUtc <= DateTime.UtcNow)
            {
                ClearAuthCookies();
                return Unauthorized(new { error = "Session expired. Please sign in again.", code = "TOKEN_EXPIRED" });
            }

            var (token, expiresAt, newRefresh) = IssueSessionTokens(
                session.UserId,
                session.Email,
                session.Name,
                session.Role,
                session.IsGuest,
                session.RememberMe);
            AppendAuthCookies(token, newRefresh, session.RememberMe, session.IsGuest);

            return Ok(new
            {
                token,
                expiresAt = expiresAt.ToString("O"),
                user = new
                {
                    id = session.UserId.ToString(),
                    email = session.Email,
                    name = session.Name,
                    role = session.Role.ToLowerInvariant(),
                    isGuest = session.IsGuest,
                    initials = ComputeInitials(session.Name)
                }
            });
        }

        [HttpPost("logout")]
        [AllowAnonymous]
        public IActionResult Logout()
        {
            var jti = User?.FindFirst(JwtRegisteredClaimNames.Jti)?.Value;
            if (!string.IsNullOrWhiteSpace(jti))
            {
                RevokedJtis[jti] = DateTime.UtcNow.AddHours(24);
            }

            var rawRefresh = Request.Cookies["meetmind_refresh_token"];
            if (!string.IsNullOrWhiteSpace(rawRefresh))
            {
                RefreshSessions.TryRemove(ComputeSha256Hex(rawRefresh), out _);
            }

            ClearAuthCookies();
            return Ok(new { success = true });
        }

        [HttpGet("me")]
        [Authorize]
        public async Task<IActionResult> Me()
        {
            var jti = User.FindFirst(JwtRegisteredClaimNames.Jti)?.Value;
            if (!string.IsNullOrWhiteSpace(jti) && RevokedJtis.ContainsKey(jti))
            {
                return Unauthorized(new { error = "Session has been signed out.", code = "SESSION_REVOKED" });
            }

            if (_currentUser.IsGuest)
            {
                return Ok(new
                {
                    id = _currentUser.UserId.ToString(),
                    email = _currentUser.Email,
                    name = "Guest Explorer",
                    role = "guest",
                    authProvider = "guest",
                    isGuest = true,
                    emailVerified = false,
                    department = "Guest Session",
                    initials = "GE"
                });
            }

            var user = await _db.Users.FirstOrDefaultAsync(u => u.Id == _currentUser.UserId);
            if (user == null)
                return Unauthorized(new { error = "Account no longer exists." });

            return Ok(ToPublicUser(user, isGuest: false, provider: string.IsNullOrEmpty(user.PasswordHash) ? "google" : "local"));
        }

        [HttpPost("forgot-password")]
        [AllowAnonymous]
        public async Task<IActionResult> ForgotPassword([FromBody] ForgotPasswordRequest request)
        {
            var email = NormalizeEmail(request.Email);
            if (!EmailRegex.IsMatch(email))
                return BadRequest(new { error = "Invalid email address." });

            var user = await _db.Users.FirstOrDefaultAsync(u => u.Email.ToLower() == email);
            if (user == null)
                return NotFound(new { error = "Account does not exist." });

            var resendKey = Environment.GetEnvironmentVariable("RESEND_API_KEY") ?? _config["Email:ResendApiKey"];
            if (string.IsNullOrWhiteSpace(resendKey))
            {
                return StatusCode(StatusCodes.Status503ServiceUnavailable, new
                {
                    error = "Password reset email delivery is not configured on this server. Configure RESEND_API_KEY and AUTH_EMAIL_FROM to enable real password reset emails.",
                    code = "EMAIL_PROVIDER_NOT_CONFIGURED"
                });
            }

            var rawToken = Convert.ToHexString(RandomNumberGenerator.GetBytes(32)).ToLowerInvariant();
            PasswordResets[ComputeSha256Hex(rawToken)] = new PasswordResetRecord(user.Id, DateTime.UtcNow.AddMinutes(15));

            var publicUrl = (Environment.GetEnvironmentVariable("PUBLIC_APP_URL") ?? $"{Request.Scheme}://{Request.Host}").TrimEnd('/');
            var resetLink = $"{publicUrl}/forgot-password?token={Uri.EscapeDataString(rawToken)}";
            var fromAddress = Environment.GetEnvironmentVariable("AUTH_EMAIL_FROM") ?? "MeetMind AI <onboarding@resend.dev>";

            using var http = new HttpClient { Timeout = TimeSpan.FromSeconds(15) };
            using var reqMsg = new HttpRequestMessage(HttpMethod.Post, "https://api.resend.com/emails");
            reqMsg.Headers.Authorization = new System.Net.Http.Headers.AuthenticationHeaderValue("Bearer", resendKey);
            reqMsg.Content = new StringContent(
                JsonSerializer.Serialize(new
                {
                    from = fromAddress,
                    to = new[] { user.Email },
                    subject = "Reset your MeetMind AI password",
                    html = $"<p>Hi {System.Net.WebUtility.HtmlEncode(user.Name)},</p><p>Use this link within 15 minutes to reset your password:</p><p><a href=\"{resetLink}\">Reset MeetMind AI Password</a></p>"
                }),
                Encoding.UTF8,
                "application/json");

            var resp = await http.SendAsync(reqMsg);
            if (!resp.IsSuccessStatusCode)
            {
                return StatusCode(StatusCodes.Status503ServiceUnavailable, new
                {
                    error = "Email delivery provider rejected the password reset request."
                });
            }

            return Ok(new { success = true, message = "Password reset link has been sent to your email address." });
        }

        [HttpPost("reset-password")]
        [AllowAnonymous]
        public async Task<IActionResult> ResetPassword([FromBody] ResetPasswordRequest request)
        {
            if (string.IsNullOrWhiteSpace(request.Token))
                return BadRequest(new { error = "Reset token is required." });

            var strengthError = ValidatePasswordStrength(request.NewPassword ?? string.Empty);
            if (strengthError != null)
                return BadRequest(new { error = strengthError });

            if (request.ConfirmPassword != null && request.ConfirmPassword != request.NewPassword)
                return BadRequest(new { error = "Passwords do not match." });

            var hash = ComputeSha256Hex(request.Token.Trim());
            if (!PasswordResets.TryRemove(hash, out var record) || record.ExpiresAtUtc <= DateTime.UtcNow)
                return BadRequest(new { error = "Invalid or expired password reset link." });

            var user = await _db.Users.FirstOrDefaultAsync(u => u.Id == record.UserId);
            if (user == null)
                return NotFound(new { error = "Account does not exist." });

            user.PasswordHash = HashPasswordPbkdf2(request.NewPassword!);
            await _db.SaveChangesAsync();

            return Ok(new { success = true, message = "Your password has been updated. You can now sign in with your new password." });
        }

        private string GetJwtSecret() =>
            _config["Jwt:Secret"]
            ?? Environment.GetEnvironmentVariable("JWT_SECRET")
            ?? "meetmind_dev_fallback_secret_change_in_prod_32chars!";

        private string? GetGoogleClientId() =>
            _config["Google:ClientId"]
            ?? Environment.GetEnvironmentVariable("GOOGLE_CLIENT_ID")
            ?? Environment.GetEnvironmentVariable("VITE_GOOGLE_CLIENT_ID");

        private (string Token, DateTime ExpiresAtUtc, string RefreshToken) IssueSessionTokens(
            Guid userId,
            string email,
            string name,
            string role,
            bool isGuest,
            bool rememberMe)
        {
            var key = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(GetJwtSecret()));
            var creds = new SigningCredentials(key, SecurityAlgorithms.HmacSha256);
            var expiresAt = isGuest
                ? DateTime.UtcNow.AddHours(6)
                : rememberMe
                    ? DateTime.UtcNow.AddHours(12)
                    : DateTime.UtcNow.AddHours(2);

            var claims = new List<Claim>
            {
                new(JwtRegisteredClaimNames.Sub, userId.ToString()),
                new(ClaimTypes.NameIdentifier, userId.ToString()),
                new(ClaimTypes.Email, email),
                new(ClaimTypes.Name, name),
                new(ClaimTypes.Role, role),
                new("is_guest", isGuest ? "true" : "false"),
                new(JwtRegisteredClaimNames.Jti, Guid.NewGuid().ToString("N"))
            };

            var jwt = new JwtSecurityToken(
                issuer: "meetmind-ai",
                audience: "meetmind-ai-client",
                claims: claims,
                expires: expiresAt,
                signingCredentials: creds);

            var accessToken = new JwtSecurityTokenHandler().WriteToken(jwt);
            var refreshToken = Convert.ToHexString(RandomNumberGenerator.GetBytes(32)).ToLowerInvariant();
            var refreshExpires = isGuest
                ? DateTime.UtcNow.AddHours(6)
                : rememberMe
                    ? DateTime.UtcNow.AddDays(30)
                    : DateTime.UtcNow.AddDays(1);

            RefreshSessions[ComputeSha256Hex(refreshToken)] = new RefreshSessionRecord(
                userId, email, name, role, isGuest, rememberMe, refreshExpires);

            return (accessToken, expiresAt, refreshToken);
        }

        private void AppendAuthCookies(string accessToken, string refreshToken, bool rememberMe, bool isGuest)
        {
            var isHttps = Request.IsHttps || string.Equals(Request.Headers["X-Forwarded-Proto"], "https", StringComparison.OrdinalIgnoreCase);
            var maxAge = isGuest ? TimeSpan.FromHours(6) : rememberMe ? TimeSpan.FromDays(30) : TimeSpan.FromDays(1);

            Response.Cookies.Append("meetmind_token", accessToken, new CookieOptions
            {
                HttpOnly = true,
                Secure = isHttps,
                SameSite = SameSiteMode.Lax,
                Path = "/",
                MaxAge = maxAge
            });

            Response.Cookies.Append("meetmind_refresh_token", refreshToken, new CookieOptions
            {
                HttpOnly = true,
                Secure = isHttps,
                SameSite = SameSiteMode.Lax,
                Path = "/",
                MaxAge = maxAge
            });
        }

        private void ClearAuthCookies()
        {
            Response.Cookies.Delete("meetmind_token", new CookieOptions { Path = "/" });
            Response.Cookies.Delete("meetmind_refresh_token", new CookieOptions { Path = "/" });
        }

        private static async Task<(string Sub, string Email, string Name)?> VerifyGoogleTokenAsync(
            string? idToken,
            string? accessToken,
            string expectedClientId)
        {
            using var http = new HttpClient { Timeout = TimeSpan.FromSeconds(10) };

            if (!string.IsNullOrWhiteSpace(idToken))
            {
                var resp = await http.GetAsync($"https://oauth2.googleapis.com/tokeninfo?id_token={Uri.EscapeDataString(idToken)}");
                if (!resp.IsSuccessStatusCode) return null;
                using var doc = JsonDocument.Parse(await resp.Content.ReadAsStringAsync());
                var root = doc.RootElement;
                var aud = root.TryGetProperty("aud", out var audEl) ? audEl.GetString() : null;
                var emailVerified = root.TryGetProperty("email_verified", out var evEl) &&
                    (evEl.ValueKind == JsonValueKind.True || string.Equals(evEl.GetString(), "true", StringComparison.OrdinalIgnoreCase));
                var email = root.TryGetProperty("email", out var emEl) ? emEl.GetString() : null;
                var sub = root.TryGetProperty("sub", out var subEl) ? subEl.GetString() : null;
                var name = root.TryGetProperty("name", out var nameEl) ? nameEl.GetString() : null;

                if (!string.Equals(aud, expectedClientId, StringComparison.Ordinal) || !emailVerified || string.IsNullOrWhiteSpace(email) || string.IsNullOrWhiteSpace(sub))
                    return null;

                return (sub, email, name ?? email.Split('@')[0]);
            }

            if (!string.IsNullOrWhiteSpace(accessToken))
            {
                var infoResp = await http.GetAsync($"https://oauth2.googleapis.com/tokeninfo?access_token={Uri.EscapeDataString(accessToken)}");
                if (!infoResp.IsSuccessStatusCode) return null;
                using var infoDoc = JsonDocument.Parse(await infoResp.Content.ReadAsStringAsync());
                var aud = infoDoc.RootElement.TryGetProperty("aud", out var audEl) ? audEl.GetString() : null;
                if (!string.IsNullOrWhiteSpace(aud) && !string.Equals(aud, expectedClientId, StringComparison.Ordinal))
                    return null;

                using var userReq = new HttpRequestMessage(HttpMethod.Get, "https://www.googleapis.com/oauth2/v3/userinfo");
                userReq.Headers.Authorization = new System.Net.Http.Headers.AuthenticationHeaderValue("Bearer", accessToken);
                var userResp = await http.SendAsync(userReq);
                if (!userResp.IsSuccessStatusCode) return null;

                using var userDoc = JsonDocument.Parse(await userResp.Content.ReadAsStringAsync());
                var root = userDoc.RootElement;
                var emailVerified = root.TryGetProperty("email_verified", out var evEl) && evEl.ValueKind == JsonValueKind.True;
                var email = root.TryGetProperty("email", out var emEl) ? emEl.GetString() : null;
                var sub = root.TryGetProperty("sub", out var subEl) ? subEl.GetString() : null;
                var name = root.TryGetProperty("name", out var nameEl) ? nameEl.GetString() : null;

                if (!emailVerified || string.IsNullOrWhiteSpace(email) || string.IsNullOrWhiteSpace(sub))
                    return null;

                return (sub, email, name ?? email.Split('@')[0]);
            }

            return null;
        }

        private static string NormalizeEmail(string? email) => (email ?? string.Empty).Trim().ToLowerInvariant();

        private static string? ValidatePasswordStrength(string password)
        {
            if (password.Length < 8) return "Password must be at least 8 characters long.";
            if (!Regex.IsMatch(password, "[A-Z]")) return "Password must include at least one uppercase letter.";
            if (!Regex.IsMatch(password, "[a-z]")) return "Password must include at least one lowercase letter.";
            if (!Regex.IsMatch(password, "[0-9]")) return "Password must include at least one number.";
            if (!Regex.IsMatch(password, "[^A-Za-z0-9]")) return "Password must include at least one special character.";
            return null;
        }

        private static string HashPasswordPbkdf2(string password)
        {
            var salt = RandomNumberGenerator.GetBytes(16);
            var key = Rfc2898DeriveBytes.Pbkdf2(password, salt, 120_000, HashAlgorithmName.SHA256, 32);
            return $"pbkdf2_sha256$120000${Convert.ToBase64String(salt)}${Convert.ToBase64String(key)}";
        }

        private static bool VerifyPasswordPbkdf2(string password, string storedHash)
        {
            var parts = storedHash.Split('$');
            if (parts.Length != 4 || parts[0] != "pbkdf2_sha256" || !int.TryParse(parts[1], out var iterations))
                return false;

            var salt = Convert.FromBase64String(parts[2]);
            var expectedKey = Convert.FromBase64String(parts[3]);
            var actualKey = Rfc2898DeriveBytes.Pbkdf2(password, salt, iterations, HashAlgorithmName.SHA256, expectedKey.Length);
            return CryptographicOperations.FixedTimeEquals(actualKey, expectedKey);
        }

        private static string ComputeSha256Hex(string input)
        {
            var bytes = SHA256.HashData(Encoding.UTF8.GetBytes(input));
            return Convert.ToHexString(bytes).ToLowerInvariant();
        }

        private static string ComputeInitials(string name)
        {
            var parts = (name ?? string.Empty).Split(' ', StringSplitOptions.RemoveEmptyEntries);
            if (parts.Length == 0) return "MM";
            if (parts.Length == 1) return parts[0][..Math.Min(2, parts[0].Length)].ToUpperInvariant();
            return $"{parts[0][0]}{parts[^1][0]}".ToUpperInvariant();
        }

        private static object ToPublicUser(User user, bool isGuest, string provider) => new
        {
            id = user.Id.ToString(),
            email = user.Email,
            name = user.Name,
            role = user.Role.ToString().ToLowerInvariant(),
            authProvider = provider,
            isGuest,
            emailVerified = provider == "google",
            department = user.Department ?? "General",
            initials = ComputeInitials(user.Name),
            createdAt = user.CreatedAtUtc.ToString("O")
        };
    }
}
