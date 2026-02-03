
# This script reads the .env file and generates an AWS Elastic Beanstalk configuration file (.ebextensions/env.config)
# to automate the setting of environment variables.

$envFile = "e:\Fworkk\server\.env"
$outputDir = "e:\Fworkk\server\.ebextensions"
$outputFile = "$outputDir\env.config"

if (-not (Test-Path $outputDir)) {
    New-Item -ItemType Directory -Path $outputDir
}

$configContent = "option_settings:`n  aws:elasticbeanstalk:application:environment:`n"

Get-Content $envFile | ForEach-Object {
    $line = $_.Trim()
    if ($line -and -not $line.StartsWith("#") -and $line -like "*=*") {
        $parts = $line.Split('=', 2)
        $key = $parts[0].Trim()
        $value = $parts[1].Trim()
        if ($key -and $value) {
            # Handle potential special characters or quotes
            $configContent += "    " + $key + ": `"" + $value + "`"`n"
        }
    }
}

Set-Content -Path $outputFile -Value $configContent

Write-Host "Success! .ebextensions/env.config has been generated."
Write-Host "Now just include the '.ebextensions' folder in your ZIP file when uploading to Elastic Beanstalk."
