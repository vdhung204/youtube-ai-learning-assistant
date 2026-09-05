$ErrorActionPreference = 'Stop'
$docxPath = 'D:\IT4-K63\UDPTDN\youtube-ai-learning-assistant\docs\architecture\SDS_YouTube_AI_Learning_Assistant_V1.docx'
$outputDir = 'D:\IT4-K63\UDPTDN\youtube-ai-learning-assistant\work\sds_api_render_word_final'
New-Item -ItemType Directory -Force -Path $outputDir | Out-Null
$pdfPath = Join-Path $outputDir 'SDS_YouTube_AI_Learning_Assistant_V1.pdf'
$wordApp = New-Object -ComObject Word.Application
$wordApp.Visible = $false
$wordApp.DisplayAlerts = 0
try {
    $document = $wordApp.Documents.Open($docxPath, $false, $false)
    $document.Fields.Update() | Out-Null
    foreach ($toc in $document.TablesOfContents) {
        $toc.Update() | Out-Null
        $toc.Range.Font.Name = 'Arial'
        $toc.Range.Font.Size = 9
        $toc.Range.ParagraphFormat.SpaceBefore = 0
        $toc.Range.ParagraphFormat.SpaceAfter = 0
        $toc.Range.ParagraphFormat.LineSpacingRule = 0
    }
    $document.Save()
    $document.ExportAsFixedFormat($pdfPath, 17)
    $pageCount = $document.ComputeStatistics(2)
    $document.Close($false)
    Write-Output "WORD_PAGES=$pageCount"
}
finally {
    $wordApp.Quit()
    [System.Runtime.InteropServices.Marshal]::ReleaseComObject($wordApp) | Out-Null
}

$pdftoppm = 'C:\Users\vuong\.cache\codex-runtimes\codex-primary-runtime\dependencies\native\poppler\Library\bin\pdftoppm.exe'
& $pdftoppm -png -r 144 $pdfPath (Join-Path $outputDir 'page') | Out-Null
Get-ChildItem -LiteralPath $outputDir -Filter 'page-*.png' | Sort-Object Name | Select-Object -ExpandProperty Name
