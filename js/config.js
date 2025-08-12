const config = {
    dnsServers: [
        { name: "Cloudflare DNS", primary: "1.1.1.1", secondary: "1.0.0.1" },
        { name: "Google DNS", primary: "8.8.8.8", secondary: "8.8.4.4" },
        { name: "Quad9 DNS", primary: "9.9.9.9", secondary: "149.112.112.112" },
        { name: "OpenDNS", primary: "208.67.222.222", secondary: "208.67.220.220" }
    ],

    mtu: {
        searchRange: { low: 1400, high: 1500 },
        headerSize: 28,
        pingTimeout: 2000
    },

    commands: {
        getTcpOptimization(guid, soVersion) {
            const cmds = [
                { cmd: "netsh int tcp set global autotuninglevel=normal", desc: "AutoTuning: normal" },
                { cmd: "netsh int tcp set global ecncapability=disabled", desc: "ECN: desactivado" },
                { cmd: "netsh int tcp set global timestamps=disabled", desc: "Timestamps: desactivado" },
                { cmd: "netsh int tcp set global maxsynretransmissions=2", desc: "SYN reintentos: 2" },
                { cmd: "netsh int tcp set global initialrto=1000", desc: "InitialRTO: 1000ms" }
            ];

            if (soVersion.startsWith("10.0.22")) {
                cmds.push(
                    { cmd: "netsh int tcp set global fastopen=enabled", desc: "TCP Fast Open: activado" },
                    { cmd: "netsh int tcp set global hystart=enabled", desc: "HyStart: activado" }
                );
            }

            cmds.push(
                { cmd: "netsh int tcp set global rsc=enabled", desc: "RSC: activado" },
                { cmd: "netsh int tcp set supplemental template=internet congestionprovider=default", desc: "Congestión: predeterminado" },
                { cmd: `reg add "HKLM\\SYSTEM\\CurrentControlSet\\Services\\Tcpip\\Parameters" /v TcpInitialRTT /t REG_DWORD /d 3 /f`, desc: "TcpInitialRTT: 3" },
                { cmd: `reg add "HKLM\\SYSTEM\\CurrentControlSet\\Services\\Tcpip\\Parameters" /v MaxUserPort /t REG_DWORD /d 65534 /f`, desc: "MaxUserPort: 65534" },
                { cmd: `reg add "HKLM\\SYSTEM\\CurrentControlSet\\Control" /v SystemResponsiveness /t REG_DWORD /d 10 /f`, desc: "SystemResponsiveness: 10" }
            );

            if (guid) {
                cmds.push(
                    { cmd: `reg add "HKLM\\SYSTEM\\CurrentControlSet\\Services\\Tcpip\\Parameters\\Interfaces\\${guid}" /v TCPNoDelay /t REG_DWORD /d 1 /f`, desc: "TCPNoDelay: 1" },
                    { cmd: `reg add "HKLM\\SYSTEM\\CurrentControlSet\\Services\\Tcpip\\Parameters\\Interfaces\\${guid}" /v TCPAckFrequency /t REG_DWORD /d 1 /f`, desc: "TCPAckFrequency: 1" },
                    { cmd: `reg add "HKLM\\SYSTEM\\CurrentControlSet\\Services\\Tcpip\\Parameters\\Interfaces\\${guid}" /v TCPDelAckTicks /t REG_DWORD /d 0 /f`, desc: "TCPDelAckTicks: 0" }
                );
            }
            return cmds;
        },

        getNetworkReset() {
            return [
                { cmd: "netsh winsock reset", desc: "Reseteando Winsock" },
                { cmd: "netsh int ip reset", desc: "Reseteando IP (requiere reinicio)", special: 'requiresReboot' },
                { cmd: "ipconfig /release", desc: "Liberando concesión de IP" },
                { cmd: "ipconfig /renew", desc: "Renovando concesión de IP" },
                { cmd: "ipconfig /flushdns", desc: "Limpiando caché de DNS" }
            ];
        },

        getQosRemoval() {
            return [
                { cmd: 'reg add "HKLM\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\Multimedia\\SystemProfile" /v NetworkThrottlingIndex /t REG_DWORD /d 4294967295 /f', desc: "Eliminando límite de QoS" }
            ];
        },

        getRestoreDefaults(adapterName, guid) {
            const safeAdapter = adapterName.replace(/"/g, '\\"');
            const cmds = [
                { cmd: "netsh int tcp set global autotuninglevel=normal", desc: "AutoTuning: normal" },
                { cmd: "netsh int tcp set global ecncapability=enabled", desc: "ECN: habilitado (default)" },
                { cmd: "netsh int tcp set global timestamps=enabled", desc: "Timestamps: habilitado (default)" },
                { cmd: "netsh int tcp set global initialrto=3000", desc: "InitialRTO: 3000ms (default)" },
                { cmd: "netsh int tcp set global rsc=default", desc: "RSC: default" },
                { cmd: 'netsh int ip set global taskoffload=enabled', desc: 'Task Offload: habilitado (default)' },
                { cmd: 'reg delete "HKLM\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\Multimedia\\SystemProfile" /v NetworkThrottlingIndex /f', desc: "Restaurando QoS a predeterminado", ignoreError: true },
                { cmd: `netsh interface ipv4 set subinterface "${safeAdapter}" mtu=1500 store=persistent`, desc: "Restaurando MTU a 1500" },
                { cmd: `netsh interface ipv4 set dnsservers name="${safeAdapter}" source=dhcp`, desc: "Restaurando DNS a automático (DHCP)" }
            ];

            if (guid) {
                cmds.push(
                    { cmd: `reg delete "HKLM\\SYSTEM\\CurrentControlSet\\Services\\Tcpip\\Parameters\\Interfaces\\${guid}" /v TCPNoDelay /f`, desc: "Eliminando clave TCPNoDelay", ignoreError: true },
                    { cmd: `reg delete "HKLM\\SYSTEM\\CurrentControlSet\\Services\\Tcpip\\Parameters\\Interfaces\\${guid}" /v TCPAckFrequency /f`, desc: "Eliminando clave TCPAckFrequency", ignoreError: true },
                    { cmd: `reg delete "HKLM\\SYSTEM\\CurrentControlSet\\Services\\Tcpip\\Parameters\\Interfaces\\${guid}" /v TCPDelAckTicks /f`, desc: "Eliminando clave TCPDelAckTicks", ignoreError: true }
                );
            }
            return cmds;
        }
    }
};