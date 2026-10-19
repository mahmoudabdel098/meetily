import React, { useState, useEffect } from "react";
import { getVersion } from '@tauri-apps/api/app';
import Image from 'next/image';
import AnalyticsConsentSwitch from "./AnalyticsConsentSwitch";


export function About() {
    const [currentVersion, setCurrentVersion] = useState<string>('0.4.1');

    useEffect(() => {
        // Get current version on mount
        getVersion().then(setCurrentVersion).catch(console.error);
    }, []);

    return (
        <div className="p-4 space-y-4 h-[80vh] overflow-y-auto">
            {/* Compact Header */}
            <div className="text-center">
                <div className="mb-3">
                    <Image
                        src="icon_128x128.png"
                        alt="Meetily Logo"
                        width={64}
                        height={64}
                        className="mx-auto"
                    />
                </div>
                <h1 className="text-xl font-bold text-gray-900">Meetily</h1>
                <span className="text-sm text-gray-500"> v{currentVersion}</span>
                <p className="text-medium text-gray-600 mt-1">
                    Trascrizioni e riassunti delle riunioni, elaborati interamente su questo PC.
                </p>
            </div>

            {/* Features Grid - Compact */}
            <div className="space-y-3">
                <div className="grid grid-cols-2 gap-2">
                    <div className="bg-gray-50 rounded p-3">
                        <h3 className="font-bold text-sm text-gray-900 mb-1">Dati sul PC</h3>
                        <p className="text-xs text-gray-600 leading-relaxed">Audio, trascrizioni e riassunti restano sul computer. Nessun servizio cloud.</p>
                    </div>
                    <div className="bg-gray-50 rounded p-3">
                        <h3 className="font-bold text-sm text-gray-900 mb-1">Modelli locali</h3>
                        <p className="text-xs text-gray-600 leading-relaxed">Trascrizione e riassunti usano modelli che girano offline.</p>
                    </div>
                    <div className="bg-gray-50 rounded p-3">
                        <h3 className="font-bold text-sm text-gray-900 mb-1">Chi ha detto cosa</h3>
                        <p className="text-xs text-gray-600 leading-relaxed">La trascrizione distingue la tua voce da quella degli altri partecipanti.</p>
                    </div>
                    <div className="bg-gray-50 rounded p-3">
                        <h3 className="font-bold text-sm text-gray-900 mb-1">Export</h3>
                        <p className="text-xs text-gray-600 leading-relaxed">Esporta trascrizioni e riassunti in PDF, Word o Markdown.</p>
                    </div>
                </div>
            </div>

            <div className="pt-2 border-t border-gray-200 text-center">
                <p className="text-xs text-gray-400">
                    Software open source. Licenze dei componenti nel file LICENSES.txt nella cartella dell&apos;applicazione.
                </p>
            </div>
            <AnalyticsConsentSwitch />
        </div>

    )
}
