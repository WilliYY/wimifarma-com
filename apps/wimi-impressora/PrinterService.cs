using System.Drawing;
using System.Drawing.Drawing2D;
using System.Drawing.Printing;
using System.Drawing.Text;
using System.Globalization;
using System.Reflection;
using System.Text.Json;

namespace WimiImpressora;

internal sealed class PrinterService
{
    private const int PaperWidthHundredths = 315;
    private const int ContentLeft = 16;
    private const int ContentWidth = 283;
    private readonly AgentConfig _config;

    public PrinterService(AgentConfig config)
    {
        _config = config;
    }

    public static string? DetectPrinter()
    {
        var printers = PrinterSettings.InstalledPrinters.Cast<string>().ToArray();
        return printers
            .Select(name => new { Name = name, Score = PrinterScore(name) })
            .Where(item => item.Score > 0)
            .OrderByDescending(item => item.Score)
            .ThenBy(item => item.Name, StringComparer.OrdinalIgnoreCase)
            .Select(item => item.Name)
            .FirstOrDefault();
    }

    public static IReadOnlyList<string> InstalledPrinters()
    {
        return PrinterSettings.InstalledPrinters.Cast<string>().OrderBy(name => name).ToArray();
    }

    public void Print(JsonElement payload)
    {
        var printerName = _config.PrinterName;
        if (!PrinterSettings.InstalledPrinters.Cast<string>().Any(name => name.Equals(printerName, StringComparison.OrdinalIgnoreCase)))
        {
            var detected = DetectPrinter();
            if (string.IsNullOrWhiteSpace(detected)) throw new InvalidOperationException("Bematech MP-4200 TH nao encontrada no Windows.");
            printerName = detected;
            _config.PrinterName = detected;
        }

        var height = ReceiptHeight(payload);
        using var document = new PrintDocument();
        document.DocumentName = $"Wimi Impressora - {ReadString(payload, "kind")}";
        document.PrintController = new StandardPrintController();
        document.PrinterSettings.PrinterName = printerName;
        if (!document.PrinterSettings.IsValid) throw new InvalidOperationException($"A impressora {printerName} nao esta valida no Windows.");
        document.DefaultPageSettings.Margins = new Margins(0, 0, 0, 0);
        document.DefaultPageSettings.PaperSize = new PaperSize("Wimifarma 80mm", PaperWidthHundredths, height);
        document.PrintPage += (_, args) =>
        {
            args.HasMorePages = false;
            if (args.Graphics is null) throw new InvalidOperationException("O driver nao forneceu a area de impressao.");
            Render(args.Graphics, payload);
        };
        document.Print();
    }

    public static void RenderPreview(JsonElement payload, string destination)
    {
        var heightHundredths = ReceiptHeight(payload);
        const float scale = 2.03f;
        var width = (int)Math.Ceiling(PaperWidthHundredths * scale);
        var height = (int)Math.Ceiling(heightHundredths * scale);
        using var bitmap = new Bitmap(width, height);
        bitmap.SetResolution(100, 100);
        using var graphics = Graphics.FromImage(bitmap);
        graphics.Clear(Color.White);
        graphics.ScaleTransform(scale, scale);
        Render(graphics, payload);
        Directory.CreateDirectory(Path.GetDirectoryName(Path.GetFullPath(destination))!);
        bitmap.Save(destination, System.Drawing.Imaging.ImageFormat.Png);
    }

    public static JsonElement TestPayload(string printerName)
    {
        return JsonSerializer.SerializeToElement(new
        {
            schema_version = 1,
            kind = "test",
            computer_name = Environment.MachineName,
            printer_name = printerName,
            agent_version = AppConstants.Version,
            requested_by = "Diagnostico local",
            requested_at = DateTimeOffset.UtcNow,
        });
    }

    public static JsonElement QuickVoucherPreviewPayload()
    {
        return JsonSerializer.SerializeToElement(new
        {
            schema_version = 1,
            kind = "quick_voucher",
            cashback_cents = 250,
            code = "7883",
            expires_at = DateTime.Today.AddMonths(6).ToString("yyyy-MM-dd", CultureInfo.InvariantCulture),
            attendant_name = "Willian Y. Y.",
            issued_at = DateTimeOffset.Now,
            whatsapp = "(44) 98413-4971",
            address = "Av. Minas Gerais, 2263",
        });
    }

    public static JsonElement PurchasePreviewPayload()
    {
        return JsonSerializer.SerializeToElement(new
        {
            schema_version = 1,
            kind = "purchase",
            operation_id = 154,
            client_name = "Jaime Loreano",
            client_phone = "(44) 99855-4135",
            gross_cents = 4000,
            cashback_used_cents = 0,
            charged_cents = 4000,
            cashback_generated_cents = 200,
            cashback_generation_mode = "credito",
            successor_code = "",
            expires_at = DateTime.Today.AddMonths(6).ToString("yyyy-MM-dd", CultureInfo.InvariantCulture),
            attendant_name = "Willian Y. Y.",
            purchased_at = DateTimeOffset.Now,
            whatsapp = "(44) 98413-4971",
            address = "Av. Minas Gerais, 2263",
        });
    }

    private static void Render(Graphics graphics, JsonElement payload)
    {
        graphics.PageUnit = GraphicsUnit.Display;
        graphics.SmoothingMode = SmoothingMode.HighQuality;
        graphics.InterpolationMode = InterpolationMode.HighQualityBicubic;
        graphics.PixelOffsetMode = PixelOffsetMode.HighQuality;
        graphics.TextRenderingHint = TextRenderingHint.AntiAliasGridFit;
        graphics.Clear(Color.White);

        var kind = ReadString(payload, "kind");
        if (kind == "quick_voucher") RenderQuickVoucher(graphics, payload);
        else if (kind == "purchase") RenderPurchase(graphics, payload);
        else RenderTest(graphics, payload);
    }

    private static void RenderQuickVoucher(Graphics graphics, JsonElement payload)
    {
        var y = DrawLogo(graphics, 12);
        y = DrawCentered(graphics, "CashBack", y + 4, 15, FontStyle.Bold, 22);
        y = DrawCentered(graphics, "Wimifarma", y, 15, FontStyle.Bold, 22);
        y = DrawCentered(graphics, "VOCE GANHOU", y + 5, 8, FontStyle.Bold, 18);
        y = DrawCentered(graphics, Money(ReadLong(payload, "cashback_cents")), y, 22, FontStyle.Bold, 39);
        y = DrawRule(graphics, y + 3);
        y = DrawCentered(graphics, "CODIGO", y + 5, 7, FontStyle.Regular, 14);
        y = DrawCentered(graphics, ReadString(payload, "code"), y - 1, 24, FontStyle.Bold, 42);
        y = DrawRule(graphics, y + 2);
        y = DrawCentered(graphics, $"Valido ate {Date(ReadString(payload, "expires_at"))}", y + 7, 11, FontStyle.Bold, 23);
        y = DrawRule(graphics, y + 5, dashed: true);
        y = DrawCentered(graphics, $"WhatsApp {ReadString(payload, "whatsapp")}", y + 7, 10.5f, FontStyle.Bold, 22);
        y = DrawCentered(graphics, ReadString(payload, "address"), y + 2, 10, FontStyle.Bold, 21);
        y = DrawCentered(graphics, $"Emitido por {ReadString(payload, "attendant_name")}", y + 9, 9.5f, FontStyle.Bold, 20);
        DrawCentered(graphics, DateTimeText(ReadString(payload, "issued_at")), y, 9.5f, FontStyle.Bold, 20);
    }

    private static void RenderPurchase(Graphics graphics, JsonElement payload)
    {
        var y = DrawLogo(graphics, 10);
        y = DrawCentered(graphics, "Comprovante CashBack", y + 3, 15, FontStyle.Bold, 32);
        y = DrawRule(graphics, y + 4);
        y = DrawCentered(graphics, "CLIENTE", y + 5, 7, FontStyle.Bold, 14);
        y = DrawCentered(graphics, ReadString(payload, "client_name"), y, 12, FontStyle.Bold, 24);
        y = DrawCentered(graphics, ReadString(payload, "client_phone"), y, 8, FontStyle.Regular, 17);
        y = DrawRule(graphics, y + 5);
        y = DrawAmountRow(graphics, "Compra", ReadLong(payload, "gross_cents"), y + 5);
        y = DrawAmountRow(graphics, "Cashback usado", ReadLong(payload, "cashback_used_cents"), y + 1);
        y = DrawAmountRow(graphics, "Valor pago", ReadLong(payload, "charged_cents"), y + 1, bold: true);
        var generatedLabel = ReadString(payload, "cashback_generation_mode") == "voucher_rapido" ? "Novo codigo" : "Novo cashback";
        y = DrawAmountRow(graphics, generatedLabel, ReadLong(payload, "cashback_generated_cents"), y + 1, bold: true);
        var code = ReadString(payload, "successor_code");
        if (!string.IsNullOrWhiteSpace(code))
        {
            y = DrawRule(graphics, y + 4);
            y = DrawCentered(graphics, "NOVO CODIGO", y + 5, 7, FontStyle.Regular, 14);
            y = DrawCentered(graphics, code, y, 22, FontStyle.Bold, 38);
        }
        var expiresAt = ReadString(payload, "expires_at");
        y = DrawCentered(graphics, string.IsNullOrWhiteSpace(expiresAt) ? "Nenhum novo cashback gerado" : $"Valido ate {Date(expiresAt)}", y + 6, 11, FontStyle.Bold, 23);
        y = DrawRule(graphics, y + 5, dashed: true);
        y = DrawCentered(graphics, $"WhatsApp {ReadString(payload, "whatsapp")}", y + 6, 10.5f, FontStyle.Bold, 22);
        y = DrawCentered(graphics, ReadString(payload, "address"), y + 1, 10, FontStyle.Bold, 21);
        y = DrawCentered(graphics, $"Operacao #{ReadLong(payload, "operation_id")} | {ReadString(payload, "attendant_name")}", y + 8, 9.5f, FontStyle.Bold, 20);
        DrawCentered(graphics, DateTimeText(ReadString(payload, "purchased_at")), y, 9.5f, FontStyle.Bold, 20);
    }

    private static void RenderTest(Graphics graphics, JsonElement payload)
    {
        var y = DrawLogo(graphics, 15);
        y = DrawCentered(graphics, "Wimi Impressora", y + 4, 16, FontStyle.Bold, 34);
        y = DrawCentered(graphics, "TESTE CONCLUIDO", y + 4, 10, FontStyle.Bold, 22);
        y = DrawRule(graphics, y + 6);
        y = DrawCentered(graphics, ReadString(payload, "printer_name"), y + 7, 9, FontStyle.Bold, 22);
        y = DrawCentered(graphics, ReadString(payload, "computer_name"), y + 2, 9, FontStyle.Regular, 20);
        y = DrawCentered(graphics, $"Agente v{ReadString(payload, "agent_version")}", y + 5, 8, FontStyle.Regular, 17);
        y = DrawCentered(graphics, $"Solicitado por {ReadString(payload, "requested_by")}", y + 7, 8, FontStyle.Regular, 18);
        DrawCentered(graphics, DateTimeText(ReadString(payload, "requested_at")), y + 2, 8, FontStyle.Regular, 18);
    }

    private static float DrawLogo(Graphics graphics, float y)
    {
        using var stream = Assembly.GetExecutingAssembly().GetManifestResourceStream("WimiImpressora.Resources.logo-wimifarma-receipt.png");
        if (stream is null) return y;
        using var image = Image.FromStream(stream);
        using var monochrome = ThermalLogo(image);
        const float width = 168;
        var height = width * monochrome.Height / monochrome.Width;
        graphics.DrawImage(monochrome, ContentLeft + (ContentWidth - width) / 2, y, width, height);
        return y + height;
    }

    private static Bitmap ThermalLogo(Image source)
    {
        using var sourceBitmap = new Bitmap(source);
        var output = new Bitmap(sourceBitmap.Width, sourceBitmap.Height);
        for (var y = 0; y < sourceBitmap.Height; y++)
        {
            for (var x = 0; x < sourceBitmap.Width; x++)
            {
                var color = sourceBitmap.GetPixel(x, y);
                var max = Math.Max(color.R, Math.Max(color.G, color.B));
                var min = Math.Min(color.R, Math.Min(color.G, color.B));
                var lowSaturation = max - min < 70;
                output.SetPixel(x, y, color.A > 30 && lowSaturation && max > 120 ? Color.Black : Color.White);
            }
        }
        return output;
    }

    private static float DrawCentered(Graphics graphics, string text, float y, float fontSize, FontStyle style, float height)
    {
        using var font = new Font("Arial", fontSize, style, GraphicsUnit.Point);
        using var format = new StringFormat { Alignment = StringAlignment.Center, LineAlignment = StringAlignment.Center, Trimming = StringTrimming.EllipsisWord };
        graphics.DrawString(text ?? string.Empty, font, Brushes.Black, new RectangleF(ContentLeft, y, ContentWidth, height), format);
        return y + height;
    }

    private static float DrawAmountRow(Graphics graphics, string label, long cents, float y, bool bold = false)
    {
        using var labelFont = new Font("Arial", bold ? 9 : 8, bold ? FontStyle.Bold : FontStyle.Regular, GraphicsUnit.Point);
        using var valueFont = new Font("Arial", bold ? 11 : 9, FontStyle.Bold, GraphicsUnit.Point);
        using var leftFormat = new StringFormat { Alignment = StringAlignment.Near, LineAlignment = StringAlignment.Center };
        using var rightFormat = new StringFormat { Alignment = StringAlignment.Far, LineAlignment = StringAlignment.Center };
        graphics.DrawString(label, labelFont, Brushes.Black, new RectangleF(ContentLeft + 4, y, 170, 22), leftFormat);
        graphics.DrawString(Money(cents), valueFont, Brushes.Black, new RectangleF(ContentLeft + 174, y, ContentWidth - 178, 22), rightFormat);
        return y + 22;
    }

    private static float DrawRule(Graphics graphics, float y, bool dashed = false)
    {
        using var pen = new Pen(Color.Black, .65f) { DashStyle = dashed ? DashStyle.Dash : DashStyle.Solid };
        graphics.DrawLine(pen, ContentLeft + 2, y, ContentLeft + ContentWidth - 2, y);
        return y + 1;
    }

    private static int ReceiptHeight(JsonElement payload)
    {
        return ReadString(payload, "kind") switch
        {
            "purchase" => string.IsNullOrWhiteSpace(ReadString(payload, "successor_code")) ? 460 : 530,
            "quick_voucher" => 450,
            _ => 320,
        };
    }

    private static int PrinterScore(string name)
    {
        var normalized = name.ToUpperInvariant();
        if (normalized.Contains("MP-4200 TH")) return 100;
        if (normalized.Contains("MP-4200")) return 90;
        if (normalized.Contains("BEMATECH")) return 70;
        if (normalized.Contains("ELGIN")) return 50;
        return 0;
    }

    private static string ReadString(JsonElement payload, string name)
    {
        if (!payload.TryGetProperty(name, out var value)) return string.Empty;
        return value.ValueKind == JsonValueKind.String ? value.GetString() ?? string.Empty : value.ToString();
    }

    private static long ReadLong(JsonElement payload, string name)
    {
        if (!payload.TryGetProperty(name, out var value)) return 0;
        if (value.TryGetInt64(out var number)) return number;
        return long.TryParse(value.ToString(), out number) ? number : 0;
    }

    private static string Money(long cents)
    {
        return (cents / 100m).ToString("C", CultureInfo.GetCultureInfo("pt-BR"));
    }

    private static string Date(string value)
    {
        return DateTime.TryParse(value, CultureInfo.InvariantCulture, DateTimeStyles.AssumeLocal, out var date)
            ? date.ToString("dd/MM/yyyy", CultureInfo.InvariantCulture)
            : "-";
    }

    private static string DateTimeText(string value)
    {
        return DateTimeOffset.TryParse(value, CultureInfo.InvariantCulture, DateTimeStyles.AssumeUniversal, out var date)
            ? TimeZoneInfo.ConvertTime(date, BrazilTimeZone()).ToString("dd/MM/yyyy HH:mm", CultureInfo.InvariantCulture)
            : "-";
    }

    private static TimeZoneInfo BrazilTimeZone()
    {
        try
        {
            return TimeZoneInfo.FindSystemTimeZoneById("E. South America Standard Time");
        }
        catch
        {
            return TimeZoneInfo.Local;
        }
    }
}
