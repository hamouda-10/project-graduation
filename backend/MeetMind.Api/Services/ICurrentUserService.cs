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
        bool IsGuest { get; }
        string Email { get; }
    }

    public class CurrentUserService : ICurrentUserService
    {
        private readonly IHttpContextAccessor _httpContextAccessor;

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
                if (!IsAuthenticated)
                {
                    return Guid.Empty;
                }

                var claim = Principal?.FindFirst(ClaimTypes.NameIdentifier)?.Value
                    ?? Principal?.FindFirst("sub")?.Value;
                if (Guid.TryParse(claim, out var parsed))
                {
                    return parsed;
                }

                return Guid.Empty;
            }
        }

        public bool IsGuest =>
            IsAuthenticated &&
            (string.Equals(Principal?.FindFirst("is_guest")?.Value, "true", StringComparison.OrdinalIgnoreCase) ||
             string.Equals(Principal?.FindFirst(ClaimTypes.Role)?.Value, "Guest", StringComparison.OrdinalIgnoreCase));

        public bool IsAdmin =>
            IsAuthenticated &&
            !IsGuest &&
            (Principal?.IsInRole("Admin") == true ||
             string.Equals(Principal?.FindFirst(ClaimTypes.Role)?.Value, "Admin", StringComparison.OrdinalIgnoreCase));

        public string Email =>
            IsAuthenticated
                ? Principal?.FindFirst(ClaimTypes.Email)?.Value ?? string.Empty
                : string.Empty;
    }
}

