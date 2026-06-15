export const getStatusColors = (status: string, isTask: boolean = false) => {
    // Normaliza a string para evitar erros de case sensity ou espaços
    const s = String(status || '').toUpperCase().trim();
    
    // 🟡 LOJA JUSTIFICADA (Amarelo/Âmbar)
    if (s === 'JUSTIFICADA') {
        return { bg: '#fef3c7', text: '#d97706', border: '#fde68a' }; 
    }
    
    // 🟢 LOJA VISITADA / TAREFA CONCLUÍDA (Verde)
    if (['REALIZADA', 'COMPLETA', 'CONCLUIDA', 'VISITADA'].includes(s)) {
        return { bg: '#dcfce7', text: '#16a34a', border: '#bbf7d0' }; 
    }
    
    // 🔴 LOJA NÃO VISITADA / CANCELADA (Vermelho)
    if (['NAO_REALIZADA', 'NAO_VISITADA', 'CANCELADA', 'NAO_RESPONDIDA'].includes(s)) {
        return { bg: '#fee2e2', text: '#dc2626', border: '#fecaca' }; 
    }
    
    // 🔵 LOJA EM ANDAMENTO (Azul)
    if (['EM_ANDAMENTO', 'INICIADA'].includes(s)) {
        return { bg: '#dbeafe', text: '#2563eb', border: '#bfdbfe' }; 
    }
    
    // 🟣 TAREFAS QUE NÃO SÃO LOJA E ESTÃO PENDENTES (Roxo)
    if (isTask) {
        return { bg: '#f3e8ff', text: '#9333ea', border: '#e9d5ff' }; 
    }
    
    // ⚪ LOJA PENDENTE OU STATUS DESCONHECIDO (Cinza)
    return { bg: '#f1f5f9', text: '#64748b', border: '#e2e8f0' }; 
};