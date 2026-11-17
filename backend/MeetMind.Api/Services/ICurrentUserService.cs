using System;
using System.Security.Claims;
using Microsoft.AspNetCore.Http;

namespace MeetMind.Api.Services
{
    public interface ICurrentUserService
    {
        Guid UserId { get; }
        bool IsAuthenticated { get; }
        bool IsAdmin { get; }
        string Email { get; }
    }

    public class CurrentUserService : ICurrentUserService
    {
        private readonly IHttpContextAccessor _httpContextAccessor;
        private static readonly Guid FallbackDevUserId = Guid.Parse("11111111-1111-1111-1111-111111111111");

        public CurrentUserService(IHttpContextAccessor httpContextAccessor)
        {
            _httpContextAccessor = httpContextAccessor;
        }

        public ClaimsPrincipal? Principal => _httpContextAccessor.HttpContext?.User;

        public bool IsAuthenticated => Principal?.Identity?.IsAuthenticated == true;

        public Guid UserId
        {
            get
            {
                var claim = Principal?.FindFirst(ClaimTypes.NameIdentifier)?.Value
                    ?? Principal?.FindFirst("sub")?.Value;
                if (Guid.TryParse(claim, out var parsed))
                {
                    return parsed;
                }

                var headerId = _httpContextAccessor.HttpContext?.Request.Headers["X-User-Id"].ToString();
                if (Guid.TryParse(headerId, out var headerGuid))
                {
                    return headerGuid;
                }

                return FallbackDevUserId;
            }
        }

        public bool IsAdmin =>
            Principal?.IsInRole("Admin") == true ||
            string.Equals(Principal?.FindFirst(ClaimTypes.Role)?.Value, "Admin", StringComparison.OrdinalIgnoreCase);

        public string Email =>
            Principal?.FindFirst(ClaimTypes.Email)?.Value ?? "alex.kim@acme.edu";
    }
}
