const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const test = require('node:test');

// Executes the real PowerShell flow with mocked OS/download commands.
// No device or system driver is modified, including in failure cases.
for (const scenario of ['success', 'badHash', 'badSignature', 'cancelled', 'notApplied']) {
    test(`Windows installer: ${scenario}`, {
        skip: process.platform !== 'win32' || !process.env.MCB_WINDOWS_DRIVER_TEST,
    }, () => {
        const source = fs.readFileSync(path.join(__dirname, '../windows-jtag.ps1'), 'utf8');
        const mocks = `
Import-Module Microsoft.PowerShell.Utility,Microsoft.PowerShell.Management,Microsoft.PowerShell.Security,Microsoft.PowerShell.Archive
$global:mcbReady=$false
$global:mcbStarted=$false
function Get-PnpDevice { param([switch]$PresentOnly) [pscustomobject]@{InstanceId='USB\\VID_303A&PID_1001&MI_02\\test';Status='OK'} }
function Get-PnpDeviceProperty { param($InstanceId)
 [pscustomobject]@{KeyName='DEVPKEY_Device_Service';Data='WinUSB'}
 [pscustomobject]@{KeyName='DEVPKEY_Device_DriverInfPath';Data='oem66.inf'}
}
function Get-ItemProperty { param($LiteralPath,$Name,$ErrorAction)
 if($global:mcbReady){[pscustomobject]@{DeviceInterfaceGUIDs=@('{80869ad8-c37f-476a-a6b4-ae241c30a473}')}}
}
function New-Item { param($ItemType,$Path,[switch]$Force) }
function Test-Path { param($LiteralPath) return $false }
function Invoke-WebRequest { param([switch]$UseBasicParsing,$Uri,$OutFile)
 if($Uri -ne 'https://dl.espressif.com/dl/idf-driver/idf-driver-esp32-usb-jtag-2021-07-15.zip'){throw 'wrong source'}
}
function Get-FileHash { param($LiteralPath,$Algorithm)
 [pscustomobject]@{Hash='${scenario === 'badHash' ? 'WRONG' : '84E741DBEC5526E3152BDED421B4F06F990CD2D1D7E83B907C40E81F9DB0F30E'}'}
}
function Expand-Archive { param($LiteralPath,$DestinationPath,[switch]$Force) }
function Get-AuthenticodeSignature { param($LiteralPath)
 [pscustomobject]@{Status='${scenario === 'badSignature' ? 'NotTrusted' : 'Valid'}';SignerCertificate=[pscustomobject]@{Subject='CN=Espressif Systems (Shanghai) Co., Ltd.'}}
}
function Start-Process { param($FilePath,$ArgumentList,$Verb,$WindowStyle,[switch]$Wait,[switch]$PassThru)
 if('${scenario}' -in @('badHash','badSignature')){throw 'unexpected elevation'}
 if($Verb -ne 'RunAs' -or $ArgumentList[0] -ne '/add-driver' -or $ArgumentList[2] -ne '/install'){throw 'wrong elevation'}
 if('${scenario}' -eq 'cancelled'){throw 'UAC cancelled'}
 $global:mcbReady=('${scenario}' -ne 'notApplied')
 [pscustomobject]@{ExitCode=0}
}
& {
${source}
} -CacheDirectory 'C:/mcb-test-cache' -Install
`;
        const powershell = path.join(process.env.SystemRoot, 'System32/WindowsPowerShell/v1.0/powershell.exe');
        const result = spawnSync(powershell, ['-NoProfile', '-NonInteractive', '-EncodedCommand',
            Buffer.from(mocks, 'utf16le').toString('base64')], { encoding: 'utf8', windowsHide: true });
        assert.ifError(result.error);
        const data = JSON.parse(result.stdout.replace(/^\uFEFF/, '').trim());
        if (scenario === 'success') {
            assert.equal(result.status, 0);
            assert.equal(data.ready, true);
            assert.equal(data.changed, true);
        } else {
            assert.equal(result.status, 1);
            assert.equal(data.ok, false);
            assert.match(data.error, { badHash: /Prüfsumme/, badSignature: /signatur/, cancelled: /cancelled/,
                notApplied: /noch nicht übernommen/ }[scenario]);
        }
    });
}
