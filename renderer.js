async function ejecutarLote(commandList) {
    ui.toggleControls(true);
    let allSucceeded = true;
    const failedCommands = [];

    for (const { cmd, desc, special, ignoreError } of commandList) {
        ui.log(`Ejecutando: ${desc}`, 'info');
        try {
            await window.api.ejecutarComando(cmd);
            if (special === 'requiresReboot') {
                ui.log("Este cambio requiere un reinicio del sistema para aplicarse.", 'warning');
            }
        } catch (error) {
            const errMsg = error?.message || 'Error desconocido';
            if (ignoreError) {
                ui.log(`Advertencia: "${desc}" no es necesario o no es soportado. (${errMsg})`, 'warning');
            } else if (special === 'requiresReboot') {
                ui.log("El reseteo se aplicará al reiniciar el sistema.", 'warning');
            } else {
                ui.log(`❌ Error al ejecutar "${desc}": ${errMsg}`, 'error');
                allSucceeded = false;
                failedCommands.push(desc);
            }
        }
    }

    if (failedCommands.length > 0) {
        ui.log("--- Resumen de Errores ---", 'error');
        failedCommands.forEach(desc => ui.log(`❌ No se pudo aplicar: ${desc}`, 'error'));
    }

    ui.toggleControls(false);
    return allSucceeded;
}

async function getAdapterGuid(adapterName) {
    try {
        const safeName = adapterName.replace(/'/g, "''");
        const command = `(Get-NetAdapter -Name '${safeName}').InterfaceGuid`;
        const result = await window.api.ejecutarComandoPs(command);
        return result.stdout.trim().replace(/[{}]/g, '');
    } catch (e) {
        ui.log(`Error al obtener el GUID del adaptador: ${e.message}`, 'error');
        return null;
    }
}

async function handleCreateBackup() {
    const confirmed = await ui.confirm(
        'Se verificará y, si es posible, se creará un Punto de Restauración del Sistema. ¿Desea continuar?'
    );
    if (!confirmed) {
        ui.log('Operación de respaldo cancelada.', 'info');
        return;
    }

    ui.toggleControls(true);
    ui.log('🔎 Verificando puntos de restauración existentes...', 'info');

    try {
        const result = await window.api.getLatestRestorePoint();
        const output = result.stdout.trim();

        if (output === 'NONE') {
            ui.log('✅ No se encontraron puntos. Creando uno nuevo...', 'info');
            await window.api.crearPuntoRestauracion();
            ui.log('🛡️ Punto de restauración creado correctamente.', 'success');
        } else {
            const latestDate = new Date(output);
            const now = new Date();
            const hoursDiff = (now - latestDate) / (1000 * 60 * 60);

            if (hoursDiff < 24) {
                ui.log(`⚠️ Punto reciente (hace ${hoursDiff.toFixed(1)} horas).`, 'warning');
                ui.log('Windows solo permite uno cada 24h.', 'warning');
            } else {
                ui.log('✅ Punto antiguo. Creando uno nuevo...', 'info');
                await window.api.crearPuntoRestauracion();
                ui.log('🛡️ Punto creado correctamente.', 'success');
            }
        }
    } catch (error) {
        ui.log(`❌ Error en el proceso: ${error.message}`, 'error');
        ui.log('Causa probable: sin permisos o Restaurar Sistema desactivado.', 'warning');
    } finally {
        ui.toggleControls(false);
    }
}

async function handleDnsSearch() {
    const adapter = ui.getSelectedAdapter();
    if (!adapter) return;

    const confirmed = await ui.confirm('Esto buscará el servidor DNS más rápido y te ofrecerá aplicarlo. ¿Deseas continuar?');
    if (!confirmed) {
        ui.log('Búsqueda de DNS cancelada.', 'info');
        return;
    }

    ui.toggleControls(true);
    ui.log("🔎 Buscando el mejor servidor DNS...", "info");

    const dnsList = config.dnsServers;
    let bestDNS = null;
    let bestTime = Infinity;

    try {
        const results = await Promise.all(dnsList.map(async dns => {
            try {
                const result = await window.api.ejecutarComandoPs(
                    `Test-Connection -ComputerName ${dns.primary} -Count 3 | Measure-Object -Property ResponseTime -Average`,
                    15000
                );
                const match = result.stdout.match(/Average\s*:\s*([\d,.]+)/);
                const time = match ? Math.round(parseFloat(match[1].replace(',', '.'))) : null;
                ui.log(time !== null ? `✔ ${dns.name}: ${time} ms` : `⚠ Sin respuesta de ${dns.name}`, time !== null ? "success" : "warning");
                return { dns, time };
            } catch {
                ui.log(`✖ No se pudo conectar a ${dns.name}`, 'error');
                return { dns, time: null };
            }
        }));

        results.forEach(({ dns, time }) => {
            if (time !== null && time < bestTime) {
                bestDNS = dns;
                bestTime = time;
            }
        });
    } catch (e) {
        ui.log(`Error en pruebas de DNS: ${e.message}`, 'error');
    }

    if (!bestDNS) {
        ui.log("✖ No se encontró ningún DNS accesible.", 'error');
        ui.toggleControls(false);
        return;
    }

    ui.log(`🎉 Mejor DNS: ${bestDNS.name}`, "success");
    ui.log(`Primario: ${bestDNS.primary}, Secundario: ${bestDNS.secondary} (${bestTime} ms)`, "info");

    const apply = await ui.confirm(`El DNS más rápido es ${bestDNS.name}. ¿Aplicarlo a "${adapter}"?`);
    if (apply) {
        const safeAdapter = adapter.replace(/"/g, '\\"');
        const commandList = [
            { cmd: `netsh interface ipv4 set dnsservers name="${safeAdapter}" static ${bestDNS.primary} primary`, desc: `DNS primario: ${bestDNS.primary}` },
            { cmd: `netsh interface ipv4 add dnsservers name="${safeAdapter}" ${bestDNS.secondary} index=2`, desc: `DNS secundario: ${bestDNS.secondary}` }
        ];
        const success = await ejecutarLote(commandList);
        ui.log(success ? "✅ DNS aplicado correctamente." : "❌ Error al aplicar DNS.", success ? "success" : "error");
    } else {
        ui.log("Operación cancelada.", "info");
    }

    ui.toggleControls(false);
}

async function handleTcpOptimization() {
    const adapter = ui.getSelectedAdapter();
    if (!adapter) return;

    const confirmed = await ui.confirm('Esto aplicará optimizaciones de TCP/IP. ¿Desea continuar?');
    if (!confirmed) {
        ui.log('Optimización cancelada.', 'info');
        return;
    }

    ui.log('Iniciando optimización de TCP/IP...', 'info');
    const guid = await getAdapterGuid(adapter);
    if (!guid) {
        ui.log('No se pudo proceder sin el GUID.', 'error');
        return;
    }

    const soVersion = window.api.obtenerVersionSO();
    const commandList = config.commands.getTcpOptimization(guid, soVersion);
    const success = await ejecutarLote(commandList);
    ui.log(success ? 'Optimización completada.' : 'Errores durante optimización.', success ? 'success' : 'error');
}

async function handleNetworkReset() {
    const confirmed = await ui.confirm('Esto reseteará la configuración de red y requerirá reinicio. ¿Está seguro?');
    if (!confirmed) {
        ui.log('Reinicio cancelado.', 'info');
        return;
    }
    ui.log('Reseteando pila de red...', 'warning');
    const commandList = config.commands.getNetworkReset();
    await ejecutarLote(commandList);
    ui.log('Reinicio de red finalizado. Reinicie el equipo.', 'success');
}

async function handleQosRemoval() {
    const confirmed = await ui.confirm('Esto eliminará el límite de QoS. ¿Continuar?');
    if (!confirmed) {
        ui.log('Cancelado.', 'info');
        return;
    }
    ui.log('Quitando límite de QoS...', 'warning');
    const success = await ejecutarLote(config.commands.getQosRemoval());
    ui.log(success ? 'QoS eliminado. Reinicie.' : 'Error al quitar QoS.', success ? 'success' : 'error');
}

async function handleRestoreDefaults() {
    const adapter = ui.getSelectedAdapter();
    if (!adapter) return;

    const confirmed = await ui.confirm('¿Restaurar configuración a predeterminados de Windows?');
    if (!confirmed) {
        ui.log('Restauración cancelada.', 'info');
        return;
    }

    ui.log('Restaurando configuración...', 'warning');
    const guid = await getAdapterGuid(adapter);
    const commandList = config.commands.getRestoreDefaults(adapter, guid);
    const success = await ejecutarLote(commandList);
    ui.log(success ? 'Restauración completada.' : 'Errores en restauración.', success ? 'success' : 'error');
}

async function handleMtuCalculation() {
    const adapter = ui.getSelectedAdapter();
    if (!adapter) return;

    const confirmed = await ui.confirm('El cálculo de MTU puede tardar. ¿Iniciar?');
    if (!confirmed) {
        ui.log('Cálculo cancelado.', 'info');
        return;
    }

    ui.toggleControls(true);
    ui.log(`Calculando MTU en "${adapter}"...`, 'info');

    try {
        const testHost = '1.1.1.1';
        let high = config.mtu.searchRange.high - config.mtu.headerSize;
        let low = 1200;
        let optimalPayload = 0;

        while (low <= high) {
            const mid = Math.floor((low + high) / 2);
            ui.log(`Probando payload: ${mid} (MTU: ${mid + config.mtu.headerSize})...`, 'info');
            try {
                await window.api.ejecutarComando(`ping ${testHost} -n 4 -l ${mid} -f -w 2000`);
                optimalPayload = mid;
                low = mid + 1;
            } catch {
                high = mid - 1;
            }
        }

        if (optimalPayload > 0) {
            const bestMtu = optimalPayload + config.mtu.headerSize;
            ui.log(`✅ MTU óptimo: ${bestMtu}`, 'success');
            const apply = await ui.confirm(`¿Aplicar MTU ${bestMtu} a "${adapter}"?`);
            if (apply) {
                const safeAdapter = adapter.replace(/"/g, '\\"');
                await ejecutarLote([{ cmd: `netsh interface ipv4 set subinterface "${safeAdapter}" mtu=${bestMtu} store=persistent`, desc: `Aplicando MTU ${bestMtu}` }]);
                ui.log('MTU aplicado correctamente.', 'success');
            }
        } else {
            ui.log('No se pudo determinar MTU óptimo.', 'error');
        }
    } catch (error) {
        ui.log(`Error durante cálculo de MTU: ${error.message}`, 'error');
    } finally {
        ui.toggleControls(false);
    }
}

document.addEventListener('DOMContentLoaded', async () => {
    ui.log('Optimizador listo.', 'success');
    ui.log('Ejecutar como Administrador para funcionamiento correcto.', 'warning');

    document.getElementById('btn-restore-point').addEventListener('click', handleCreateBackup);
    document.getElementById('btn-dns').addEventListener('click', handleDnsSearch);
    document.getElementById('btn-tcp').addEventListener('click', handleTcpOptimization);
    document.getElementById('btn-mtu').addEventListener('click', handleMtuCalculation);
    document.getElementById('btn-reset').addEventListener('click', handleNetworkReset);
    document.getElementById('btn-qos').addEventListener('click', handleQosRemoval);
    document.getElementById('btn-restore-defaults').addEventListener('click', handleRestoreDefaults);

    try {
        const adaptadores = await window.api.obtenerAdaptadores();
        ui.populateAdapters(adaptadores);
    } catch (error) {
        ui.adapterSelect.innerHTML = '<option>Error al cargar</option>';
        ui.log(`Error al obtener adaptadores: ${error.message}`, 'error');
    }
});