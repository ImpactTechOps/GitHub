function Sync-GitRepo {
    param(
        [Parameter(Mandatory=$true)]
        [string]$RepoPath,
        [string]$Branch = "master"
    
    )
    
    try {
        Set-Location $RepoPath
        Write-Host "Fetching latest changes..." -ForegroundColor Yellow
        git fetch origin
        
        Write-Host "Resetting to origin/$Branch..." -ForegroundColor Yellow
        git reset --hard "origin/$Branch"
        
        Write-Host "Pulling latest changes..." -ForegroundColor Yellow
        git pull origin $Branch
        
        Write-Host "Repository sync complete!" -ForegroundColor Green
    }
    catch {
        Write-Host "Error syncing repository: $_" -ForegroundColor Red
    }
}