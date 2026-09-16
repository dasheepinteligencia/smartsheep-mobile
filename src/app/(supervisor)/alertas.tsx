// OMNI_SUPERVISOR_EXPERIENCE_V1
//
// O supervisor usa o mesmo motor confiável de Alertas.
// A única diferença visual é ocultar o botão "voltar", porque
// Alertas já é uma tab fixa dentro da experiência Supervisor.
import React from 'react';
import Alertas from '../(tabs)/alertas';

export default function SupervisorAlertas() {
  return <Alertas showBackButton={false} />;
}
