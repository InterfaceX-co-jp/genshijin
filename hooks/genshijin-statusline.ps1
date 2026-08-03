$Utf8NoBom = New-Object System.Text.UTF8Encoding($false)
[Console]::OutputEncoding = $Utf8NoBom

$ClaudeDir = if ($env:CLAUDE_CONFIG_DIR) { $env:CLAUDE_CONFIG_DIR } else { Join-Path $HOME ".claude" }
$Flag = Join-Path $ClaudeDir ".genshijin-active"
if (-not (Test-Path $Flag)) { exit 0 }

# reparse point (symlink / junction) とサイズ超過ファイル拒否
# 攻撃者がフラグを secret ファイルへの symlink に置換した場合、
# 描画毎にその内容（ANSI エスケープ含む）が端末に流れる攻撃を塞ぐ
try {
    $Item = Get-Item -LiteralPath $Flag -Force -ErrorAction Stop
    if ($Item.Attributes -band [System.IO.FileAttributes]::ReparsePoint) { exit 0 }
    if ($Item.Length -gt 64) { exit 0 }
} catch {
    exit 0
}

$Mode = ""
try {
    $Raw = Get-Content -LiteralPath $Flag -TotalCount 1 -ErrorAction Stop
    if ($null -ne $Raw) { $Mode = ([string]$Raw).Trim() }
} catch {
    exit 0
}

# [a-z0-9-] 以外除去 → ホワイトリスト検証
$Mode = $Mode.ToLowerInvariant()
$Mode = ($Mode -replace '[^a-z0-9-]', '')

$Valid = @('off','polite','normal','extreme','commit','review','compress','help')
if (-not ($Valid -contains $Mode)) { exit 0 }
if ($Mode -eq 'off') { exit 0 }

# ASCII モード → 日本語ラベル
$Label = switch ($Mode) {
    'polite'   { '丁寧' }
    'normal'   { '' }
    'extreme'  { '極限' }
    'commit'   { 'コミット' }
    'review'   { 'レビュー' }
    'compress' { '圧縮' }
    'help'     { 'ヘルプ' }
    default    { '' }
}

$Esc = [char]27
if ([string]::IsNullOrEmpty($Label)) {
    [Console]::Write("${Esc}[38;5;172m[原始人]${Esc}[0m")
} else {
    [Console]::Write("${Esc}[38;5;172m[原始人:$Label]${Esc}[0m")
}

# /genshijin-stats が書出した savings suffix (存在時のみ)
$SuffixPath = Join-Path $ClaudeDir ".genshijin-statusline-suffix"
if (Test-Path $SuffixPath) {
    try {
        $SuffixItem = Get-Item -LiteralPath $SuffixPath -Force -ErrorAction Stop
        if (-not ($SuffixItem.Attributes -band [System.IO.FileAttributes]::ReparsePoint) -and $SuffixItem.Length -le 32) {
            $Suffix = (Get-Content -LiteralPath $SuffixPath -Raw -ErrorAction Stop).Trim()
            if ($Suffix) {
                [Console]::Write(" ${Esc}[38;5;108m$Suffix${Esc}[0m")
            }
        }
    } catch {}
}
