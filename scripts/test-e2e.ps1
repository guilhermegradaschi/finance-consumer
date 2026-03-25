# ============================================================
# Script de Teste End-to-End - NF-e Processor
# ============================================================
# Uso: powershell -ExecutionPolicy Bypass -File scripts/test-e2e.ps1
# ============================================================

$ErrorActionPreference = "Continue"
$baseUrl = "http://localhost:3000"
$jwtSecret = "dev-secret-key-change-in-production"

Write-Host "`n========================================" -ForegroundColor Cyan
Write-Host "  NF-e Processor - Teste End-to-End" -ForegroundColor Cyan
Write-Host "========================================`n" -ForegroundColor Cyan

# ---- Funcao para gerar JWT ----
function Get-JwtToken {
    $header = @{ alg = "HS256"; typ = "JWT" } | ConvertTo-Json -Compress
    $payload = @{
        sub = "test-user"
        name = "Tester"
        role = "admin"
        iat = [int](Get-Date -UFormat %s)
        exp = [int](Get-Date -UFormat %s) + 3600
    } | ConvertTo-Json -Compress

    $headerB64 = [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($header)).TrimEnd('=').Replace('+', '-').Replace('/', '_')
    $payloadB64 = [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($payload)).TrimEnd('=').Replace('+', '-').Replace('/', '_')

    $hmac = New-Object System.Security.Cryptography.HMACSHA256
    $hmac.Key = [Text.Encoding]::UTF8.GetBytes($jwtSecret)
    $sigBytes = $hmac.ComputeHash([Text.Encoding]::UTF8.GetBytes("$headerB64.$payloadB64"))
    $sigB64 = [Convert]::ToBase64String($sigBytes).TrimEnd('=').Replace('+', '-').Replace('/', '_')

    return "$headerB64.$payloadB64.$sigB64"
}

$token = Get-JwtToken
Write-Host "JWT Token gerado com sucesso" -ForegroundColor Green
Write-Host "Token: $($token.Substring(0, 50))...`n"

# ---- PASSO 1: Health Check ----
Write-Host "--- PASSO 1: Health Check ---" -ForegroundColor Yellow
try {
    $health = Invoke-RestMethod -Uri "$baseUrl/health/live" -Method GET
    Write-Host "  /health/live => $($health | ConvertTo-Json -Compress)" -ForegroundColor Green
} catch {
    Write-Host "  FALHOU: App nao esta rodando em $baseUrl" -ForegroundColor Red
    Write-Host "  Execute: docker compose -f docker/docker-compose.yml up -d && npm run start:dev" -ForegroundColor Red
    exit 1
}

try {
    $ready = Invoke-RestMethod -Uri "$baseUrl/health/ready" -Method GET
    Write-Host "  /health/ready => $($ready | ConvertTo-Json -Compress)" -ForegroundColor Green
} catch {
    Write-Host "  /health/ready falhou (pode ser normal se DB nao conectou)" -ForegroundColor Yellow
}

# ---- PASSO 2: Swagger UI ----
Write-Host "`n--- PASSO 2: Swagger UI ---" -ForegroundColor Yellow
try {
    $swagger = Invoke-WebRequest -Uri "$baseUrl/api/docs" -Method GET -UseBasicParsing
    Write-Host "  /api/docs => Status $($swagger.StatusCode) (Swagger UI disponivel)" -ForegroundColor Green
} catch {
    Write-Host "  Swagger nao disponivel" -ForegroundColor Yellow
}

# ---- PASSO 3: Auth - Sem Token (deve retornar 401) ----
Write-Host "`n--- PASSO 3: Autenticacao JWT ---" -ForegroundColor Yellow
try {
    $noAuth = Invoke-WebRequest -Uri "$baseUrl/api/v1/nf" -Method POST -ContentType "application/json" -Body '{"xmlContent":"<test/>"}' -UseBasicParsing
    Write-Host "  POST sem token => $($noAuth.StatusCode) (INESPERADO - deveria ser 401)" -ForegroundColor Red
} catch {
    $statusCode = $_.Exception.Response.StatusCode.Value__
    if ($statusCode -eq 401) {
        Write-Host "  POST sem token => 401 Unauthorized (CORRETO)" -ForegroundColor Green
    } else {
        Write-Host "  POST sem token => $statusCode (inesperado)" -ForegroundColor Yellow
    }
}

# ---- PASSO 4: Submeter NF-e valida ----
Write-Host "`n--- PASSO 4: Submeter NF-e Valida ---" -ForegroundColor Yellow

$xmlContent = Get-Content -Path "test/fixtures/valid-nfe.xml" -Raw
$body = @{
    xmlContent = $xmlContent
    source = "API"
} | ConvertTo-Json -Depth 5

$headers = @{
    "Authorization" = "Bearer $token"
    "Content-Type" = "application/json"
}

try {
    $submit = Invoke-RestMethod -Uri "$baseUrl/api/v1/nf" -Method POST -Headers $headers -Body $body
    Write-Host "  POST /api/v1/nf =>" -ForegroundColor Green
    Write-Host "    chaveAcesso: $($submit.chaveAcesso)" -ForegroundColor White
    Write-Host "    status: $($submit.status)" -ForegroundColor White
    Write-Host "    alreadyProcessed: $($submit.alreadyProcessed)" -ForegroundColor White
    Write-Host "    idempotencyKey: $($submit.idempotencyKey)" -ForegroundColor White
    $chaveAcesso = $submit.chaveAcesso
} catch {
    $statusCode = $_.Exception.Response.StatusCode.Value__
    $errorBody = $_.ErrorDetails.Message
    Write-Host "  POST falhou: $statusCode - $errorBody" -ForegroundColor Red
    $chaveAcesso = "35240112345678000195550010000001231234567890"
}

# ---- PASSO 5: Idempotencia (enviar mesma NF novamente) ----
Write-Host "`n--- PASSO 5: Teste de Idempotencia ---" -ForegroundColor Yellow
try {
    $dup = Invoke-RestMethod -Uri "$baseUrl/api/v1/nf" -Method POST -Headers $headers -Body $body
    if ($dup.alreadyProcessed -eq $true) {
        Write-Host "  Segunda submissao => alreadyProcessed=true (IDEMPOTENCIA OK)" -ForegroundColor Green
    } else {
        Write-Host "  Segunda submissao => alreadyProcessed=$($dup.alreadyProcessed)" -ForegroundColor Yellow
    }
} catch {
    Write-Host "  Erro na segunda submissao (pode indicar problema)" -ForegroundColor Yellow
}

# ---- PASSO 6: Aguardar pipeline processar ----
Write-Host "`n--- PASSO 6: Aguardando pipeline (5s) ---" -ForegroundColor Yellow
Start-Sleep -Seconds 5
Write-Host "  Pipeline deveria ter processado a NF via RabbitMQ" -ForegroundColor White

# ---- PASSO 7: Consultar NF pelo chaveAcesso ----
Write-Host "`n--- PASSO 7: Consultar NF por chaveAcesso ---" -ForegroundColor Yellow
try {
    $nf = Invoke-RestMethod -Uri "$baseUrl/api/v1/nf/$chaveAcesso" -Method GET -Headers $headers
    Write-Host "  GET /api/v1/nf/$chaveAcesso =>" -ForegroundColor Green
    Write-Host "    id: $($nf.id)" -ForegroundColor White
    Write-Host "    status: $($nf.status)" -ForegroundColor White
    Write-Host "    numero: $($nf.numero)" -ForegroundColor White
    Write-Host "    serie: $($nf.serie)" -ForegroundColor White
    Write-Host "    valorTotalNf: $($nf.valorTotalNf)" -ForegroundColor White
} catch {
    $statusCode = $_.Exception.Response.StatusCode.Value__
    Write-Host "  NF nao encontrada ($statusCode) - pipeline pode nao ter completado ainda" -ForegroundColor Yellow
}

# ---- PASSO 8: Listar NFs com filtros ----
Write-Host "`n--- PASSO 8: Listar NFs ---" -ForegroundColor Yellow
try {
    $list = Invoke-RestMethod -Uri "$baseUrl/api/v1/nf?page=1&limit=10" -Method GET -Headers $headers
    Write-Host "  GET /api/v1/nf?page=1&limit=10 =>" -ForegroundColor Green
    Write-Host "    total: $($list.total)" -ForegroundColor White
    Write-Host "    page: $($list.page)" -ForegroundColor White
    Write-Host "    totalPages: $($list.totalPages)" -ForegroundColor White
} catch {
    Write-Host "  Listagem falhou" -ForegroundColor Yellow
}

# ---- PASSO 9: Consultar logs de processamento ----
Write-Host "`n--- PASSO 9: Logs de Processamento ---" -ForegroundColor Yellow
try {
    $logs = Invoke-RestMethod -Uri "$baseUrl/api/v1/nf/$chaveAcesso/logs" -Method GET -Headers $headers
    Write-Host "  GET /api/v1/nf/$chaveAcesso/logs =>" -ForegroundColor Green
    foreach ($log in $logs) {
        Write-Host "    [$($log.stage)] $($log.status) - $($log.durationMs)ms" -ForegroundColor White
    }
} catch {
    Write-Host "  Logs nao encontrados" -ForegroundColor Yellow
}

# ---- PASSO 10: Summary ----
Write-Host "`n--- PASSO 10: Status Summary ---" -ForegroundColor Yellow
try {
    $summary = Invoke-RestMethod -Uri "$baseUrl/api/v1/nf/summary" -Method GET -Headers $headers
    Write-Host "  GET /api/v1/nf/summary =>" -ForegroundColor Green
    foreach ($s in $summary) {
        Write-Host "    $($s.status): $($s.count)" -ForegroundColor White
    }
} catch {
    Write-Host "  Summary falhou" -ForegroundColor Yellow
}

# ---- Resumo ----
Write-Host "`n========================================" -ForegroundColor Cyan
Write-Host "  Teste E2E Concluido!" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "`nLinks uteis:" -ForegroundColor White
Write-Host "  Swagger UI:     $baseUrl/api/docs" -ForegroundColor White
Write-Host "  RabbitMQ Mgmt:  http://localhost:15672 (nf_user/nf_password)" -ForegroundColor White
Write-Host "  MinIO Console:  http://localhost:9001 (minioadmin/minioadmin)" -ForegroundColor White
Write-Host ""
