using System;
using System.Text;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http.Features;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.IdentityModel.Tokens;
using MeetMind.Api.Hubs;
using MeetMind.Api.Services;
using MeetMind.Infrastructure.Data;

var builder = WebApplication.CreateBuilder(args);

builder.Services.AddControllers()
    .AddJsonOptions(options =>
    {
        options.JsonSerializerOptions.ReferenceHandler = System.Text.Json.Serialization.ReferenceHandler.IgnoreCycles;
    });

var maxUploadMb = builder.Configuration.GetValue<long?>("Storage:MaxRecordingSizeMb") ?? 500;
var maxUploadBytes = maxUploadMb * 1024L * 1024L;

builder.WebHost.ConfigureKestrel(options =>
{
    options.Limits.MaxRequestBodySize = maxUploadBytes;
    options.Limits.KeepAliveTimeout = TimeSpan.FromMinutes(10);
    options.Limits.RequestHeadersTimeout = TimeSpan.FromMinutes(5);
});

builder.Services.Configure<FormOptions>(options =>
{
    options.MultipartBodyLengthLimit = maxUploadBytes;
    options.ValueLengthLimit = int.MaxValue;
    options.MultipartHeadersLengthLimit = int.MaxValue;
});

builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen(c =>
{
    c.SwaggerDoc("v1", new() { Title = "MeetMind AI Enterprise API", Version = "v1" });
});

// Database
var connectionString = builder.Configuration.GetConnectionString("DefaultConnection")
    ?? "Server=localhost,1433;Database=MeetMindDb;User Id=sa;Password=Your_password123!;TrustServerCertificate=True;";
builder.Services.AddDbContext<ApplicationDbContext>(options =>
    options.UseSqlServer(connectionString));

// Real-time SignalR
builder.Services.AddSignalR();

// Auth & User Context
var jwtSecret = builder.Configuration["Jwt:Secret"] ?? Environment.GetEnvironmentVariable("JWT_SECRET") ?? "meetmind_dev_fallback_secret_change_in_prod_32chars!";
builder.Services.AddAuthentication(JwtBearerDefaults.AuthenticationScheme)
    .AddJwtBearer(options =>
    {
        options.TokenValidationParameters = new TokenValidationParameters
        {
            ValidateIssuer = false,
            ValidateAudience = false,
            ValidateLifetime = true,
            ValidateIssuerSigningKey = true,
            IssuerSigningKey = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(jwtSecret))
        };
    });

builder.Services.AddHttpContextAccessor();
builder.Services.AddScoped<ICurrentUserService, CurrentUserService>();
builder.Services.AddSingleton<IMediaValidationService, MediaValidationService>();
builder.Services.AddScoped<IPdfExportService, PdfExportService>();

// Python AI Service Typed HttpClient
var aiBaseUrl = builder.Configuration["AiService:BaseUrl"] ?? "http://localhost:8000";
builder.Services.AddHttpClient<IAiServiceClient, AiServiceClient>(client =>
{
    client.BaseAddress = new Uri(aiBaseUrl.TrimEnd('/'));
    client.Timeout = TimeSpan.FromMinutes(10);
});

// Background Processing Queue & Worker
builder.Services.AddSingleton<IBackgroundProcessingQueue, BackgroundProcessingQueue>();
builder.Services.AddHostedService<RecordingProcessingWorker>();

// CORS (supports configurable production frontend origins via Cors:AllowedOrigins or CORS_ALLOWED_ORIGINS)
var configuredOrigins = (
    builder.Configuration["Cors:AllowedOrigins"]
    ?? Environment.GetEnvironmentVariable("CORS_ALLOWED_ORIGINS")
    ?? "http://localhost:3000,https://localhost:3000,https://project-graduation.ai.studio"
).Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);

builder.Services.AddCors(options =>
{
    options.AddPolicy("AllowFrontend", policy =>
    {
        policy.WithOrigins(configuredOrigins)
              .AllowAnyHeader()
              .AllowAnyMethod()
              .AllowCredentials();
    });
});

var app = builder.Build();

if (app.Environment.IsDevelopment())
{
    app.UseSwagger();
    app.UseSwaggerUI();
}

app.UseCors("AllowFrontend");
app.UseAuthentication();
app.UseAuthorization();
app.MapControllers();
app.MapHub<ProcessingHub>("/hubs/processing");

app.Run();
