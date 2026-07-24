using System.Diagnostics;
using System.Text.Json;
using System.Text.RegularExpressions;
using System.Windows.Forms;

namespace WimiImpressora;

internal static partial class Installer
{
    public static string InstallDirectory => Path.Combine(
        Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles),
        "Wimifarma",
        "Wimi Impressora");

    public static string InstalledExecutable => Path.Combine(InstallDirectory, AppConstants.InstalledFileName);

    public static async Task<int> RunAsync()
    {
        ApplicationConfiguration.Initialize();
        var store = new ConfigStore();
        try
        {
            var printerName = PrinterService.DetectPrinter();
            if (string.IsNullOrWhiteSpace(printerName))
            {
                var available = PrinterService.InstalledPrinters();
                var detail = available.Count == 0
                    ? "Nenhuma impressora esta instalada no Windows."
                    : $"Impressoras encontradas: {string.Join(", ", available)}";
                throw new InvalidOperationException($"Nao encontrei a Bematech MP-4200 TH. Confirme o cabo USB e o driver. {detail}");
            }

            var existing = store.Load();
            AgentConfig config;
            if (existing is not null && !string.IsNullOrWhiteSpace(existing.EncryptedDeviceToken))
            {
                config = new AgentConfig
                {
                    ServerBaseUrl = existing.ServerBaseUrl,
                    DeviceId = existing.DeviceId,
                    DeviceUid = existing.DeviceUid,
                    ComputerName = Environment.MachineName,
                    PrinterName = printerName,
                    EncryptedDeviceToken = existing.EncryptedDeviceToken,
                    PairedAt = existing.PairedAt,
                };
            }
            else
            {
                var ticket = PairingTicketFromExecutable();
                if (string.IsNullOrWhiteSpace(ticket))
                {
                    throw new InvalidOperationException("Este arquivo nao contem o vinculo de instalacao. Baixe novamente pelo card Wimi Impressora usando o login adm.");
                }
                var deviceUid = store.GetDeviceUid();
                var paired = await ApiClient.PairAsync(new PairRequest
                {
                    Ticket = ticket,
                    DeviceUid = deviceUid,
                    ComputerName = Environment.MachineName,
                    PrinterName = printerName,
                    AgentVersion = AppConstants.Version,
                }, CancellationToken.None);
                config = new AgentConfig
                {
                    DeviceId = paired.DeviceId,
                    DeviceUid = deviceUid,
                    ComputerName = Environment.MachineName,
                    PrinterName = printerName,
                    EncryptedDeviceToken = store.ProtectToken(paired.DeviceToken),
                    PairedAt = DateTimeOffset.UtcNow,
                };
            }

            store.Save(config);
            InstallServiceExecutable();
            ConfigureService();

            string testMessage;
            try
            {
                new PrinterService(config).Print(PrinterService.TestPayload(printerName));
                testMessage = "Um comprovante de teste foi enviado para a Bematech.";
            }
            catch (Exception printError)
            {
                testMessage = $"O servico foi instalado, mas o teste nao imprimiu: {printError.Message}";
            }

            MessageBox.Show(
                $"Wimi Impressora instalada e conectada.\n\nComputador: {Environment.MachineName}\nImpressora: {printerName}\n\n{testMessage}\n\nEla iniciara sozinha com o Windows.",
                "Wimi Impressora",
                MessageBoxButtons.OK,
                MessageBoxIcon.Information);
            return 0;
        }
        catch (Exception error)
        {
            MessageBox.Show(
                error.Message,
                "Wimi Impressora - instalacao nao concluida",
                MessageBoxButtons.OK,
                MessageBoxIcon.Error);
            return 1;
        }
    }

    public static int ApplyUpdate(string targetPath)
    {
        try
        {
            RunSc(false, "stop", AppConstants.ServiceName);
            WaitForServiceFile(targetPath, TimeSpan.FromSeconds(30));
            Directory.CreateDirectory(Path.GetDirectoryName(targetPath)!);
            File.Copy(Environment.ProcessPath!, targetPath, true);
            RunSc(true, "start", AppConstants.ServiceName);
            return 0;
        }
        catch
        {
            return 1;
        }
    }

    private static void InstallServiceExecutable()
    {
        var source = Environment.ProcessPath ?? throw new InvalidOperationException("Nao foi possivel localizar o instalador em execucao.");
        Directory.CreateDirectory(InstallDirectory);
        RunSc(false, "stop", AppConstants.ServiceName);
        if (!Path.GetFullPath(source).Equals(Path.GetFullPath(InstalledExecutable), StringComparison.OrdinalIgnoreCase))
        {
            if (File.Exists(InstalledExecutable)) WaitForServiceFile(InstalledExecutable, TimeSpan.FromSeconds(30));
            File.Copy(source, InstalledExecutable, true);
        }
    }

    private static void ConfigureService()
    {
        var binaryPath = $"\"{InstalledExecutable}\" --service";
        if (RunSc(false, "query", AppConstants.ServiceName) != 0)
        {
            RunSc(true, "create", AppConstants.ServiceName, "binPath=", binaryPath, "start=", "delayed-auto", "DisplayName=", AppConstants.ServiceDisplayName);
        }
        else
        {
            RunSc(true, "config", AppConstants.ServiceName, "binPath=", binaryPath, "start=", "delayed-auto", "DisplayName=", AppConstants.ServiceDisplayName);
        }
        RunSc(false, "description", AppConstants.ServiceName, "Impressao termica segura do Cashback Wimifarma.");
        RunSc(false, "failure", AppConstants.ServiceName, "reset=", "86400", "actions=", "restart/5000/restart/15000/restart/60000");
        RunSc(false, "failureflag", AppConstants.ServiceName, "1");
        EnsureServiceStarted();
    }

    private static void EnsureServiceStarted()
    {
        const int ServiceAlreadyRunning = 1056;
        var exitCode = RunSc(false, "start", AppConstants.ServiceName);
        if (exitCode != 0 && exitCode != ServiceAlreadyRunning)
        {
            throw new InvalidOperationException("Nao foi possivel iniciar o servico Wimi Impressora.");
        }
    }

    private static int RunSc(bool throwOnFailure, params string[] arguments)
    {
        using var process = new Process
        {
            StartInfo = new ProcessStartInfo
            {
                FileName = Path.Combine(Environment.SystemDirectory, "sc.exe"),
                UseShellExecute = false,
                CreateNoWindow = true,
                RedirectStandardOutput = true,
                RedirectStandardError = true,
            },
        };
        foreach (var argument in arguments) process.StartInfo.ArgumentList.Add(argument);
        process.Start();
        var output = process.StandardOutput.ReadToEnd();
        var error = process.StandardError.ReadToEnd();
        process.WaitForExit(20000);
        if (throwOnFailure && process.ExitCode != 0)
        {
            throw new InvalidOperationException($"Falha ao configurar o servico do Windows: {error} {output}".Trim());
        }
        return process.ExitCode;
    }

    private static void WaitForServiceFile(string targetPath, TimeSpan timeout)
    {
        var deadline = DateTime.UtcNow + timeout;
        while (DateTime.UtcNow < deadline)
        {
            try
            {
                using var stream = File.Open(targetPath, FileMode.Open, FileAccess.ReadWrite, FileShare.None);
                return;
            }
            catch
            {
                Thread.Sleep(750);
            }
        }
        throw new IOException("O servico nao liberou o arquivo para atualizacao.");
    }

    private static string PairingTicketFromExecutable()
    {
        var fileName = Path.GetFileName(Environment.ProcessPath ?? string.Empty);
        return PairingFileNameRegex().Match(fileName).Groups["ticket"].Value;
    }

    [GeneratedRegex(@"^WimiImpressoraSetup--(?<ticket>[A-Za-z0-9_-]{43})(?: \(\d+\))?\.exe$", RegexOptions.IgnoreCase | RegexOptions.CultureInvariant)]
    private static partial Regex PairingFileNameRegex();
}
