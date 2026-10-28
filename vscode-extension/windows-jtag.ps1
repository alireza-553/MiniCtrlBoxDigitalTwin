param([Parameter(Mandatory=$true)][string]$CacheDirectory, [switch]$Install)
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding($false)

function Get-JtagState {
    $devices = @(Get-PnpDevice -PresentOnly | Where-Object { $_.InstanceId -like 'USB\VID_303A&PID_1001&MI_02\*' })
    if ($devices.Count -ne 1) { throw 'Bitte genau eine MiniCtrlBox am nativen USB-Anschluss verbinden.' }
    $device = $devices[0]
    $properties = Get-PnpDeviceProperty -InstanceId $device.InstanceId
    $service = ($properties | Where-Object KeyName -eq 'DEVPKEY_Device_Service').Data
    $inf = ($properties | Where-Object KeyName -eq 'DEVPKEY_Device_DriverInfPath').Data
    $key = 'HKLM:\SYSTEM\CurrentControlSet\Enum\' + $device.InstanceId + '\Device Parameters'
    $guids = (Get-ItemProperty -LiteralPath $key -Name DeviceInterfaceGUIDs -ErrorAction SilentlyContinue).DeviceInterfaceGUIDs
    $ready = $device.Status -eq 'OK' -and $service -eq 'WinUSB' -and
        @($guids) -contains '{80869ad8-c37f-476a-a6b4-ae241c30a473}'
    return @{ ready = [bool]$ready; driver = $inf }
}

try {
    $state = Get-JtagState
    $changed = $false
    if (-not $state.ready -and $Install) {
        # The fixed vendor archive is verified before extraction or elevation.
        New-Item -ItemType Directory -Path $CacheDirectory -Force | Out-Null
        $archive = Join-Path $CacheDirectory 'idf-driver-esp32-usb-jtag-2021-07-15.zip'
        $expected = '84E741DBEC5526E3152BDED421B4F06F990CD2D1D7E83B907C40E81F9DB0F30E'
        if (-not (Test-Path -LiteralPath $archive) -or (Get-FileHash -LiteralPath $archive -Algorithm SHA256).Hash -ne $expected) {
            Invoke-WebRequest -UseBasicParsing -Uri 'https://dl.espressif.com/dl/idf-driver/idf-driver-esp32-usb-jtag-2021-07-15.zip' -OutFile $archive
        }
        if ((Get-FileHash -LiteralPath $archive -Algorithm SHA256).Hash -ne $expected) {
            throw 'Die Prüfsumme des Espressif-Treiberpakets stimmt nicht. Die Installation wurde abgebrochen.'
        }
        $directory = Join-Path $CacheDirectory 'esp32-usb-jtag'
        Expand-Archive -LiteralPath $archive -DestinationPath $directory -Force
        $catalog = Join-Path $directory 'USB_JTAG_debug_unit.cat'
        $signature = Get-AuthenticodeSignature -LiteralPath $catalog
        if ($signature.Status -ne 'Valid' -or -not $signature.SignerCertificate.Subject.Contains('Espressif Systems (Shanghai) Co., Ltd.')) {
            throw 'Die Espressif-Treibersignatur ist ungültig. Die Installation wurde abgebrochen.'
        }
        $inf = Join-Path $directory 'USB_JTAG_debug_unit.inf'
        $pnputil = Join-Path $env:SystemRoot 'System32\pnputil.exe'
        # Only MI_02 is matched by this signed INF; the serial interface is not rebound.
        $update = Start-Process -FilePath $pnputil -ArgumentList @('/add-driver', ('"' + $inf + '"'), '/install') -Verb RunAs -WindowStyle Hidden -Wait -PassThru
        if ($update.ExitCode -notin @(0, 3010)) {
            throw ('Die Treiberzuordnung ist fehlgeschlagen (Windows-Code ' + $update.ExitCode + ').')
        }
        $state = Get-JtagState
        if (-not $state.ready) { throw 'Windows hat den Treiber noch nicht übernommen. MiniCtrlBox neu verbinden; bei Bedarf Windows neu starten und erneut versuchen.' }
        $changed = $true
    }
    @{ ok = $true; ready = $state.ready; changed = $changed; driver = $state.driver } | ConvertTo-Json -Compress
} catch {
    @{ ok = $false; error = $_.Exception.Message } | ConvertTo-Json -Compress
    exit 1
}
