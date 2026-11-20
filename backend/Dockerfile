FROM mcr.microsoft.com/dotnet/sdk:8.0 AS build
WORKDIR /src
COPY MeetMind.sln ./
COPY MeetMind.Core/ ./MeetMind.Core/
COPY MeetMind.Infrastructure/ ./MeetMind.Infrastructure/
COPY MeetMind.Api/ ./MeetMind.Api/
RUN dotnet restore
RUN dotnet publish MeetMind.Api/MeetMind.Api.csproj -c Release -o /app/publish

FROM mcr.microsoft.com/dotnet/aspnet:8.0 AS final
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg && rm -rf /var/lib/apt/lists/*
COPY --from=build /app/publish .
RUN mkdir -p /app/data/recordings
EXPOSE 5000
ENV ASPNETCORE_URLS=http://+:5000
ENTRYPOINT ["dotnet", "MeetMind.Api.dll"]
