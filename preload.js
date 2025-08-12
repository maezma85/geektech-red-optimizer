const { contextBridge, ipcRenderer } = require('electron');
const { exec } = require('child_process');
const os = require('os');

function ejecutarComandoBase(command, isPs = false, timeout = 30000) {
    return new Promise((resolve, reject) => {
        let finalCmd = command;
        if (isPs) {
            const encodedCommand = Buffer.from(command, 'utf16le').toString('base64');
            finalCmd = `powershell -ExecutionPolicy Bypass -NoProfile -NonInteractive -EncodedCommand ${encodedCommand}`;
        }

        exec(finalCmd, { encoding: 'utf8', timeout }, (error, stdout, stderr) => {
            if (error) {
                return reject({ type: 'ExecutionError', message: (stderr || error.message || 'Error desconocido').trim() });
            }
            resolve({ stdout: stdout.trim(), stderr: stderr.trim() });
        });
    });
}

contextBridge.exposeInMainWorld('api', {
    obtenerAdaptadores: async () => {
        try {
            const psCmd = `Get-NetAdapter | Where-Object { $_.Status -eq 'Up' } | Select-Object -Property Name, InterfaceDescription | ConvertTo-Json -Compress`;
            const result = await ejecutarComandoBase(psCmd, true, 15000);

            if (result.stdout) {
                let adaptadores = JSON.parse(result.stdout);
                if (!Array.isArray(adaptadores)) {
                    adaptadores = [adaptadores];
                }
                return adaptadores.map(adapter => ({ name: adapter.Name, displayName: adapter.InterfaceDescription }));
            }
        } catch (e) {
            try {
                const result = await ejecutarComandoBase('netsh interface show interface', false, 10000);
                return result.stdout
                    .split('\n')
                    .slice(3)
                    .map(line => line.trim())
                    .filter(line => line)
                    .map(line => {
                        const parts = line.split(/\s{2,}/);
                        const adapterName = parts[parts.length - 1];
                        return { name: adapterName, displayName: adapterName };
                    })
                    .filter(Boolean);
            } catch (err) {
                throw err;
            }
        }
        return [];
    },

    ejecutarComando: (command, timeout) => ejecutarComandoBase(command, false, timeout || 30000),

    ejecutarComandoPs: (command, timeout) => ejecutarComandoBase(command, true, timeout || 90000),

    crearPuntoRestauracion: () => {
        const command = `$ErrorActionPreference = 'Stop'; Checkpoint-Computer -Description 'Backup previo a Geektech Red Optimizer' -RestorePointType 'MODIFY_SETTINGS'`;
        return ejecutarComandoBase(command, true, 90000);
    },

    getLatestRestorePoint: () => {
        const command = `
          $restorePoint = Get-ComputerRestorePoint | Sort-Object -Property SequenceNumber -Descending | Select-Object -First 1;
          if ($null -eq $restorePoint) {
            Write-Host "NONE";
          } else {
            $dt = [System.Management.ManagementDateTimeConverter]::ToDateTime($restorePoint.CreationTime);
            Get-Date $dt -Format o;
          }
        `;
        return ejecutarComandoBase(command, true, 15000);
    },

    obtenerVersionSO: () => {
        return os.release();
    }
});