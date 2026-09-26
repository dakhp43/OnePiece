# Synthesizes the demo script (BUILD_PLAN §15) with Windows SAPI voices, one WAV per line,
# and records per-word timings. scripts/build-demo-fixture.ts stitches these into
# data/fixtures/demo/demo.wav plus an ElevenLabs-shaped transcript fixture.
# Placeholder until the team records the real role-play.
$ErrorActionPreference = "Stop"
Add-Type -AssemblyName System.Speech

$lines = @(
  @("speaker_0", "Hi Rosa, good to see you again. How have you been since we bumped up your blood pressure medicine?"),
  @("speaker_1", "Pretty good, but I've had this dry, tickly cough for about three weeks. It's worse at night."),
  @("speaker_0", "Any fever, or shortness of breath?"),
  @("speaker_1", "No fever, and my breathing is fine."),
  @("speaker_0", "And you're taking the lisinopril every day?"),
  @("speaker_1", "Yes, every morning. I think it's the 20 milligram, or maybe 40? The bottle's at home."),
  @("speaker_0", "Okay. Your blood pressure today is 138 over 88, which is better than last time. Have you been checking at home?"),
  @("speaker_1", "A few times. Mostly in the 130s."),
  @("speaker_0", "Good. That cough is a known side effect of lisinopril, so I'd like to switch you to losartan, 50 milligrams once a day, and stop the lisinopril."),
  @("speaker_1", "Okay, that's fine."),
  @("speaker_0", "Keep cutting back on salt like we discussed. Let's check your blood pressure again in four weeks."),
  @("speaker_1", "Sounds good. Thank you, doctor.")
)

$outDir = Join-Path $PSScriptRoot "..\data\fixtures\demo\tts"
New-Item -ItemType Directory -Force $outDir | Out-Null
$timings = @()

for ($i = 0; $i -lt $lines.Count; $i++) {
  $speaker = $lines[$i][0]
  $text = $lines[$i][1]
  $synth = New-Object System.Speech.Synthesis.SpeechSynthesizer
  $synth.SelectVoice($(if ($speaker -eq "speaker_0") { "Microsoft David Desktop" } else { "Microsoft Zira Desktop" }))
  $synth.Rate = 0
  $words = New-Object System.Collections.ArrayList
  $synth.add_SpeakProgress({
    param($s, $e)
    [void]$words.Add(@{ text = $e.Text; start = $e.AudioPosition.TotalSeconds; charPos = $e.CharacterPosition })
  })
  $fmt = New-Object System.Speech.AudioFormat.SpeechAudioFormatInfo(16000, [System.Speech.AudioFormat.AudioBitsPerSample]::Sixteen, [System.Speech.AudioFormat.AudioChannel]::Mono)
  $wav = Join-Path $outDir ("line{0:D2}.wav" -f $i)
  $synth.SetOutputToWaveFile($wav, $fmt)
  $synth.Speak($text)
  $synth.SetOutputToNull()
  $synth.Dispose()
  $timings += @{ index = $i; speaker = $speaker; text = $text; file = (Split-Path $wav -Leaf); words = @($words) }
}

$timings | ConvertTo-Json -Depth 6 | Out-File -Encoding utf8 (Join-Path $outDir "timings.json")
Write-Host "Wrote $($lines.Count) lines to $outDir"
