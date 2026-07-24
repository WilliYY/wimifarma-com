using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Security.Cryptography;
using System.Text.Json;

namespace WimiImpressora;

internal sealed class ApiClient : IDisposable
{
    private static readonly JsonSerializerOptions JsonOptions = new() { PropertyNameCaseInsensitive = true };
    private readonly AgentConfig _config;
    private readonly ConfigStore _store;
    private readonly HttpClient _http;

    public ApiClient(AgentConfig config, ConfigStore store)
    {
        _config = config;
        _store = store;
        _http = CreateHttpClient(config.ServerBaseUrl);
        _http.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", ConfigStore.UnprotectToken(config));
    }

    public static async Task<PairResponse> PairAsync(PairRequest request, CancellationToken cancellationToken)
    {
        using var http = CreateHttpClient(AppConstants.ServerBaseUrl);
        using var response = await http.PostAsJsonAsync("api/internal/print-agent/pair", request, JsonOptions, cancellationToken);
        var payload = await response.Content.ReadFromJsonAsync<PairResponse>(JsonOptions, cancellationToken)
            ?? new PairResponse { Message = "Resposta vazia do servidor." };
        if (!response.IsSuccessStatusCode || !payload.Ok)
        {
            throw new InvalidOperationException(payload.Message ?? $"Pareamento recusado ({(int)response.StatusCode}).");
        }
        return payload;
    }

    public async Task<HeartbeatResponse> HeartbeatAsync(string printerName, string? lastError, CancellationToken cancellationToken)
    {
        using var response = await _http.PostAsJsonAsync("api/internal/print-agent/heartbeat", new
        {
            printer_name = printerName,
            agent_version = AppConstants.Version,
            last_error = lastError,
        }, cancellationToken);
        await EnsureSuccessAsync(response, cancellationToken);
        return await response.Content.ReadFromJsonAsync<HeartbeatResponse>(JsonOptions, cancellationToken)
            ?? new HeartbeatResponse();
    }

    public async Task<PrintJob?> ClaimNextJobAsync(CancellationToken cancellationToken)
    {
        using var response = await _http.GetAsync("api/internal/print-agent/jobs/next", cancellationToken);
        await EnsureSuccessAsync(response, cancellationToken);
        var payload = await response.Content.ReadFromJsonAsync<JobEnvelope>(JsonOptions, cancellationToken);
        return payload?.Job;
    }

    public async Task CompleteJobAsync(long jobId, string status, string? error, CancellationToken cancellationToken)
    {
        using var response = await _http.PostAsJsonAsync($"api/internal/print-agent/jobs/{jobId}/complete", new
        {
            status,
            error,
        }, cancellationToken);
        await EnsureSuccessAsync(response, cancellationToken);
    }

    public async Task<VersionResponse> GetVersionAsync(CancellationToken cancellationToken)
    {
        using var response = await _http.GetAsync("api/internal/print-agent/version", cancellationToken);
        await EnsureSuccessAsync(response, cancellationToken);
        return await response.Content.ReadFromJsonAsync<VersionResponse>(JsonOptions, cancellationToken)
            ?? new VersionResponse();
    }

    public async Task<string> DownloadUpdateAsync(VersionResponse version, CancellationToken cancellationToken)
    {
        if (!version.Available || string.IsNullOrWhiteSpace(version.Sha256))
        {
            throw new InvalidOperationException("Atualizacao sem arquivo ou assinatura SHA-256.");
        }

        using var response = await _http.GetAsync("api/internal/print-agent/update", HttpCompletionOption.ResponseHeadersRead, cancellationToken);
        await EnsureSuccessAsync(response, cancellationToken);
        var destination = Path.Combine(Path.GetTempPath(), $"WimiImpressoraUpdate-{Guid.NewGuid():N}.exe");
        await using (var input = await response.Content.ReadAsStreamAsync(cancellationToken))
        await using (var output = File.Create(destination))
        {
            await input.CopyToAsync(output, cancellationToken);
        }

        await using var verificationStream = File.OpenRead(destination);
        var actualHash = Convert.ToHexString(await SHA256.HashDataAsync(verificationStream, cancellationToken)).ToLowerInvariant();
        if (!actualHash.Equals(version.Sha256, StringComparison.OrdinalIgnoreCase))
        {
            File.Delete(destination);
            throw new InvalidOperationException("A atualizacao baixada nao passou na verificacao SHA-256.");
        }
        return destination;
    }

    private static HttpClient CreateHttpClient(string baseUrl)
    {
        return new HttpClient
        {
            BaseAddress = new Uri(baseUrl.TrimEnd('/') + "/"),
            Timeout = TimeSpan.FromSeconds(30),
        };
    }

    private static async Task EnsureSuccessAsync(HttpResponseMessage response, CancellationToken cancellationToken)
    {
        if (response.IsSuccessStatusCode) return;
        var message = string.Empty;
        try
        {
            using var payload = JsonDocument.Parse(await response.Content.ReadAsStringAsync(cancellationToken));
            if (payload.RootElement.TryGetProperty("message", out var value)) message = value.GetString() ?? string.Empty;
        }
        catch
        {
            // The HTTP status remains useful when the server response is not JSON.
        }
        throw new HttpRequestException(string.IsNullOrWhiteSpace(message)
            ? $"Servidor respondeu {(int)response.StatusCode}."
            : message);
    }

    public void Dispose()
    {
        _http.Dispose();
    }
}
