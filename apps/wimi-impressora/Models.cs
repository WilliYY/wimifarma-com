using System.Text.Json;
using System.Text.Json.Serialization;

namespace WimiImpressora;

internal sealed class AgentConfig
{
    public string ServerBaseUrl { get; init; } = AppConstants.ServerBaseUrl;
    public long DeviceId { get; init; }
    public string DeviceUid { get; init; } = string.Empty;
    public string ComputerName { get; init; } = string.Empty;
    public string PrinterName { get; set; } = string.Empty;
    public string EncryptedDeviceToken { get; init; } = string.Empty;
    public DateTimeOffset PairedAt { get; init; } = DateTimeOffset.UtcNow;
}

internal sealed class PairRequest
{
    [JsonPropertyName("ticket")]
    public string Ticket { get; init; } = string.Empty;

    [JsonPropertyName("device_uid")]
    public string DeviceUid { get; init; } = string.Empty;

    [JsonPropertyName("computer_name")]
    public string ComputerName { get; init; } = string.Empty;

    [JsonPropertyName("printer_name")]
    public string PrinterName { get; init; } = string.Empty;

    [JsonPropertyName("agent_version")]
    public string AgentVersion { get; init; } = string.Empty;
}

internal sealed class PairResponse
{
    [JsonPropertyName("ok")]
    public bool Ok { get; init; }

    [JsonPropertyName("message")]
    public string? Message { get; init; }

    [JsonPropertyName("device_id")]
    public long DeviceId { get; init; }

    [JsonPropertyName("device_token")]
    public string DeviceToken { get; init; } = string.Empty;
}

internal sealed class HeartbeatResponse
{
    [JsonPropertyName("ok")]
    public bool Ok { get; init; }

    [JsonPropertyName("server_version")]
    public string ServerVersion { get; init; } = AppConstants.Version;

    [JsonPropertyName("update_available")]
    public bool UpdateAvailable { get; init; }
}

internal sealed class JobEnvelope
{
    [JsonPropertyName("ok")]
    public bool Ok { get; init; }

    [JsonPropertyName("message")]
    public string? Message { get; init; }

    [JsonPropertyName("job")]
    public PrintJob? Job { get; init; }
}

internal sealed class PrintJob
{
    [JsonPropertyName("id")]
    public long Id { get; init; }

    [JsonPropertyName("receipt_type")]
    public string ReceiptType { get; init; } = string.Empty;

    [JsonPropertyName("entity_id")]
    public long? EntityId { get; init; }

    [JsonPropertyName("payload")]
    public JsonElement Payload { get; init; }

    [JsonPropertyName("attempt")]
    public int Attempt { get; init; }
}

internal sealed class VersionResponse
{
    [JsonPropertyName("ok")]
    public bool Ok { get; init; }

    [JsonPropertyName("version")]
    public string Version { get; init; } = AppConstants.Version;

    [JsonPropertyName("available")]
    public bool Available { get; init; }

    [JsonPropertyName("sha256")]
    public string? Sha256 { get; init; }

    [JsonPropertyName("download_url")]
    public string? DownloadUrl { get; init; }
}

internal sealed class PendingJobJournal
{
    public long JobId { get; init; }
    public DateTimeOffset ClaimedAt { get; init; }
}

internal static class AppConstants
{
    public const string Version = "1.0.0";
    public const string ServerBaseUrl = "https://wimifarma.com/cashback";
    public const string ServiceName = "WimiImpressora";
    public const string ServiceDisplayName = "Wimi Impressora";
    public const string InstalledFileName = "WimiImpressora.exe";
}
