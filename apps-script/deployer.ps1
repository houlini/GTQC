# GTQC — envoie gtqc.gs dans le projet Apps Script « GTQC » et met à jour le déploiement
# de l'application web utilisé par les Workers (même adresse /exec, nouvelle version).
# Prérequis (une fois) : API Apps Script activée (script.google.com/home/usersettings),
#                        « npx @google/clasp login », puis SCRIPT_ID et DEPLOIEMENT remplis ci-dessous
#                        (voir README, section Mise en ligne).
# Utilisation : pwsh apps-script/deployer.ps1 "Description de la version"
param([string]$Description = 'Mise à jour')
$ErrorActionPreference = 'Stop'

$SCRIPT_ID = ''     # Paramètres du projet → ID du script
$DEPLOIEMENT = ''   # Déployer → Gérer les déploiements → ID de déploiement (AKfy…)
if (-not $SCRIPT_ID) { throw 'SCRIPT_ID vide : crée le projet Apps Script et colle son ID dans deployer.ps1' }

# Dossier temporaire : le projet en ligne n'a qu'un fichier, Code.js (+ le manifeste).
$tmp = Join-Path $env:TEMP 'gtqc-clasp'
Remove-Item $tmp -Recurse -Force -ErrorAction SilentlyContinue
New-Item -ItemType Directory $tmp | Out-Null
Copy-Item (Join-Path $PSScriptRoot 'appsscript.json') $tmp
Copy-Item (Join-Path $PSScriptRoot 'gtqc.gs') (Join-Path $tmp 'Code.js')
"{ `"scriptId`": `"$SCRIPT_ID`", `"rootDir`": `"`" }" | Set-Content (Join-Path $tmp '.clasp.json') -Encoding utf8

Push-Location $tmp
try {
  npx --yes @google/clasp push -f
  if ($LASTEXITCODE -ne 0) { throw 'clasp push a échoué' }
  if ($DEPLOIEMENT) { npx --yes @google/clasp deploy -i $DEPLOIEMENT -d $Description }
  else { npx --yes @google/clasp deploy -d $Description }
  if ($LASTEXITCODE -ne 0) { throw 'clasp deploy a échoué' }
} finally {
  Pop-Location
}
