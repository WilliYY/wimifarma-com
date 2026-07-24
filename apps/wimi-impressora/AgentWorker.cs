using System.Diagnostics;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;

namespace WimiImpressora;

internal sealed class AgentWorker : BackgroundService
{
    private readonly AgentConfig _config;
    private readonly ConfigStore _store;
    private readonly ApiClient _api;
    private readonly PrinterService _printer;
    private readonly IHostApplicationLifetime _lifetime;
    private readonly ILogger<AgentWorker> _logger;
    private DateTimeOffset _nextHeartbeat = DateTimeOffset.MinValue;
    private DateTimeOffset _nextUpdateCheck = DateTimeOffset.UtcNow.AddMinutes(1);
    private string? _lastError;

    public AgentWorker(
        AgentConfig config,
        ConfigStore store,
        ApiClient api,
        PrinterService printer,
        IHostApplicationLifetime lifetime,
        ILogger<AgentWorker> logger)
    {
        _config = config;
        _store = store;
        _api = api;
        _printer = printer;
        _lifetime = lifetime;
        _logger = logger;
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        await RecoverInterruptedJobAsync(stoppingToken);
        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                RefreshPrinterSelection();
                if (DateTimeOffset.UtcNow >= _nextHeartbeat)
                {
                    await _api.HeartbeatAsync(_config.PrinterName, _lastError, stoppingToken);
                    _nextHeartbeat = DateTimeOffset.UtcNow.AddSeconds(15);
                }

                var job = await _api.ClaimNextJobAsync(stoppingToken);
                if (job is not null) await ProcessJobAsync(job, stoppingToken);

                if (DateTimeOffset.UtcNow >= _nextUpdateCheck)
                {
                    await CheckForUpdateAsync(stoppingToken);
                    _nextUpdateCheck = DateTimeOffset.UtcNow.AddHours(6);
                }
            }
            catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
            {
                break;
            }
            catch (Exception error)
            {
                _lastError = Limit(error.Message, 600);
                _logger.LogError(error, "Falha no ciclo da Wimi Impressora");
                await Task.Delay(TimeSpan.FromSeconds(8), stoppingToken);
            }

            await Task.Delay(TimeSpan.FromSeconds(2), stoppingToken);
        }
    }

    private async Task ProcessJobAsync(PrintJob job, CancellationToken cancellationToken)
    {
        _store.SavePendingJob(job.Id);
        try
        {
            _printer.Print(job.Payload);
        }
        catch (Exception error)
        {
            var message = Limit(error.Message, 800);
            await CompleteJobWithRetryAsync(job.Id, "failed", message, cancellationToken);
            _lastError = message;
            _logger.LogError(error, "Falha no trabalho {JobId}", job.Id);
            return;
        }

        // After Print() returns, Windows has accepted the job. Keep this journal and retry
        // the acknowledgement instead of labelling it as failed or taking another job.
        await CompleteJobWithRetryAsync(job.Id, "printed", null, cancellationToken);
        _lastError = null;
        _logger.LogInformation("Trabalho {JobId} enviado ao spooler", job.Id);
    }

    private async Task CompleteJobWithRetryAsync(long jobId, string status, string? error, CancellationToken cancellationToken)
    {
        while (!cancellationToken.IsCancellationRequested)
        {
            try
            {
                await _api.CompleteJobAsync(jobId, status, error, cancellationToken);
                _store.ClearPendingJob();
                return;
            }
            catch (OperationCanceledException) when (cancellationToken.IsCancellationRequested)
            {
                throw;
            }
            catch (Exception completionError)
            {
                _lastError = status == "printed"
                    ? "Comprovante enviado ao spooler; aguardando confirmacao segura do servidor."
                    : Limit(completionError.Message, 600);
                _logger.LogWarning(completionError, "Nao foi possivel confirmar o trabalho {JobId}; nova tentativa em instantes", jobId);
                await Task.Delay(TimeSpan.FromSeconds(8), cancellationToken);
            }
        }
    }

    private async Task RecoverInterruptedJobAsync(CancellationToken cancellationToken)
    {
        var pending = _store.LoadPendingJob();
        if (pending is null || pending.JobId <= 0) return;
        try
        {
            await _api.CompleteJobAsync(
                pending.JobId,
                "uncertain",
                "O agente foi interrompido durante a impressao. Confira o papel antes de reimprimir.",
                cancellationToken);
            _store.ClearPendingJob();
        }
        catch (Exception error)
        {
            _logger.LogWarning(error, "Nao foi possivel recuperar o trabalho {JobId}", pending.JobId);
        }
    }

    private void RefreshPrinterSelection()
    {
        var installed = PrinterService.InstalledPrinters();
        if (installed.Any(name => name.Equals(_config.PrinterName, StringComparison.OrdinalIgnoreCase))) return;
        var detected = PrinterService.DetectPrinter();
        if (string.IsNullOrWhiteSpace(detected)) throw new InvalidOperationException("Bematech MP-4200 TH nao encontrada no Windows.");
        _config.PrinterName = detected;
        _store.Save(_config);
    }

    private async Task CheckForUpdateAsync(CancellationToken cancellationToken)
    {
        var version = await _api.GetVersionAsync(cancellationToken);
        if (!version.Available || CompareVersions(AppConstants.Version, version.Version) >= 0) return;
        var updatePath = await _api.DownloadUpdateAsync(version, cancellationToken);
        var process = new ProcessStartInfo
        {
            FileName = updatePath,
            UseShellExecute = false,
            CreateNoWindow = true,
        };
        process.ArgumentList.Add("--apply-update");
        process.ArgumentList.Add(Installer.InstalledExecutable);
        Process.Start(process);
        _lifetime.StopApplication();
    }

    private static int CompareVersions(string left, string right)
    {
        var a = left.Split('.', '-').Take(3).Select(value => int.TryParse(value, out var part) ? part : 0).ToArray();
        var b = right.Split('.', '-').Take(3).Select(value => int.TryParse(value, out var part) ? part : 0).ToArray();
        for (var index = 0; index < 3; index++)
        {
            var result = (a.ElementAtOrDefault(index)).CompareTo(b.ElementAtOrDefault(index));
            if (result != 0) return result;
        }
        return 0;
    }

    private static string Limit(string value, int limit)
    {
        return string.IsNullOrWhiteSpace(value) ? "Falha sem detalhe." : value.Trim()[..Math.Min(value.Trim().Length, limit)];
    }
}
