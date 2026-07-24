using Microsoft.Win32;
using System.Globalization;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;

namespace WimiImpressora;

internal sealed class ConfigStore
{
    private static readonly byte[] Entropy = Encoding.UTF8.GetBytes("Wimifarma.WimiImpressora.DeviceToken.v1");
    private static readonly JsonSerializerOptions JsonOptions = new() { WriteIndented = true };

    public string DataDirectory { get; } = Path.Combine(
        Environment.GetFolderPath(Environment.SpecialFolder.CommonApplicationData),
        "Wimifarma",
        "Wimi Impressora");

    public string ConfigPath => Path.Combine(DataDirectory, "config.json");
    public string PendingJobPath => Path.Combine(DataDirectory, "pending-job.json");

    public AgentConfig? Load()
    {
        try
        {
            return File.Exists(ConfigPath)
                ? JsonSerializer.Deserialize<AgentConfig>(File.ReadAllText(ConfigPath), JsonOptions)
                : null;
        }
        catch
        {
            return null;
        }
    }

    public AgentConfig LoadRequired()
    {
        return Load() ?? throw new InvalidOperationException("Configuracao da Wimi Impressora nao encontrada. Baixe o instalador novamente no card ADM.");
    }

    public void Save(AgentConfig config)
    {
        Directory.CreateDirectory(DataDirectory);
        var temporary = ConfigPath + ".tmp";
        File.WriteAllText(temporary, JsonSerializer.Serialize(config, JsonOptions), Encoding.UTF8);
        File.Move(temporary, ConfigPath, true);
    }

    public static string ProtectToken(string token)
    {
        var protectedBytes = ProtectedData.Protect(Encoding.UTF8.GetBytes(token), Entropy, DataProtectionScope.LocalMachine);
        return Convert.ToBase64String(protectedBytes);
    }

    public static string UnprotectToken(AgentConfig config)
    {
        var bytes = Convert.FromBase64String(config.EncryptedDeviceToken);
        return Encoding.UTF8.GetString(ProtectedData.Unprotect(bytes, Entropy, DataProtectionScope.LocalMachine));
    }

    public string GetDeviceUid()
    {
        var machineGuid = string.Empty;
        try
        {
            machineGuid = Convert.ToString(Registry.GetValue(
                @"HKEY_LOCAL_MACHINE\SOFTWARE\Microsoft\Cryptography",
                "MachineGuid",
                string.Empty), CultureInfo.InvariantCulture) ?? string.Empty;
        }
        catch
        {
            // A stable local file is used when MachineGuid cannot be read.
        }

        if (string.IsNullOrWhiteSpace(machineGuid))
        {
            Directory.CreateDirectory(DataDirectory);
            var fallbackPath = Path.Combine(DataDirectory, "device-id.txt");
            machineGuid = File.Exists(fallbackPath) ? File.ReadAllText(fallbackPath).Trim() : Guid.NewGuid().ToString("N");
            if (!File.Exists(fallbackPath)) File.WriteAllText(fallbackPath, machineGuid, Encoding.ASCII);
        }

        var source = Encoding.UTF8.GetBytes($"{machineGuid}|{Environment.MachineName}|WimiImpressora");
        return Convert.ToHexString(SHA256.HashData(source)).ToLowerInvariant();
    }

    public void SavePendingJob(long jobId)
    {
        Directory.CreateDirectory(DataDirectory);
        File.WriteAllText(PendingJobPath, JsonSerializer.Serialize(new PendingJobJournal
        {
            JobId = jobId,
            ClaimedAt = DateTimeOffset.UtcNow,
        }, JsonOptions), Encoding.UTF8);
    }

    public PendingJobJournal? LoadPendingJob()
    {
        try
        {
            return File.Exists(PendingJobPath)
                ? JsonSerializer.Deserialize<PendingJobJournal>(File.ReadAllText(PendingJobPath), JsonOptions)
                : null;
        }
        catch
        {
            return null;
        }
    }

    public void ClearPendingJob()
    {
        try
        {
            if (File.Exists(PendingJobPath)) File.Delete(PendingJobPath);
        }
        catch
        {
            // A stale journal is reported as uncertain again on the next start.
        }
    }
}
