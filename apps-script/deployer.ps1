# GTQC — envoie gtqc.gs dans le projet Apps Script « GTQC » et met à jour le déploiement
# de l'application web utilisé par les Workers (même adresse /exec, nouvelle version).
# Prérequis (une fois) : API Apps Script activée (script.google.com/home/usersettings) et « npx @google/clasp login ».
# Le code SECRET partagé avec les Workers est lu dans _prive/gtqc-script-secret.txt (exclu de Git) et envoyé
# à part (Secret.js) : il n'est jamais dans le dépôt.
# Utilisation : pwsh apps-script/deployer.ps1 "Description de la version"
param([string]$Description = 'Mise à jour')
$ErrorActionPreference = 'Stop'

$SCRIPT_ID = '1_OlozgAUIRveR1qCcuQJvpbUHqahMxlHEgLLFo7IR8-0lQUq_RdVI6wX'
$DEPLOIEMENT = 'AKfycbzJbeGOtd_rx1QSuYW28Yt4tExXuTpkkc87Mj1q_rxdTyZIdhq88XZL7e2MtLHyavFt'
if (-not $SCRIPT_ID) { throw 'SCRIPT_ID vide : crée le projet Apps Script et colle son ID dans deployer.ps1' }

$racine = Split-Path $PSScriptRoot -Parent
$fichierSecret = Join-Path $racine '_prive\gtqc-script-secret.txt'
if (-not (Test-Path $fichierSecret)) { throw "Code SECRET introuvable : $fichierSecret" }
$secret = (Get-Content $fichierSecret -Raw).Trim()

# Dossier temporaire : le projet en ligne a Code.js, Secret.js et le manifeste.
$tmp = Join-Path $env:TEMP 'gtqc-clasp'
Remove-Item $tmp -Recurse -Force -ErrorAction SilentlyContinue
New-Item -ItemType Directory $tmp | Out-Null
Copy-Item (Join-Path $PSScriptRoot 'appsscript.json') $tmp
Copy-Item (Join-Path $PSScriptRoot 'gtqc.gs') (Join-Path $tmp 'Code.js')
"// Généré par deployer.ps1 : ne pas copier ailleurs.`nconst SECRET_DEPLOYE = '$secret';" | Set-Content (Join-Path $tmp 'Secret.js') -Encoding utf8
"{ `"scriptId`": `"$SCRIPT_ID`", `"rootDir`": `"`" }" | Set-Content (Join-Path $tmp '.clasp.json') -Encoding utf8

Push-Location $tmp
try {
  npx --yes @google/clasp push -f
  if ($LASTEXITCODE -ne 0) { throw 'clasp push a échoué' }
  if ($DEPLOIEMENT) { npx --yes @google/clasp create-deployment -i $DEPLOIEMENT -d $Description }
  else { npx --yes @google/clasp create-deployment -d $Description }
  if ($LASTEXITCODE -ne 0) { throw 'clasp deploy a échoué' }
} finally {
  Pop-Location
  Remove-Item $tmp -Recurse -Force -ErrorAction SilentlyContinue
}
