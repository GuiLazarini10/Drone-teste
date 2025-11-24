import React from 'react'

// Componente de notificações (toasts)
// Props:
//  - toasts: array de { id, title, message, type }
//  - removeToast(id): função para remover um toast (geralmente chamada ao fechar ou expirar)
export default function Toasts({ toasts, removeToast }){
  return (
    <div style={{ position: 'fixed', right: 20, bottom: 20, zIndex: 1000 }}>
      {toasts.map(t => (
        <div key={t.id} style={{ minWidth: 240, marginBottom: 8 }}>
          <div style={{ padding: 12, borderRadius: 8, background: t.type === 'error' ? '#fef2f2' : '#ecfdf5', border: t.type === 'error' ? '1px solid #fecaca' : '1px solid #bbf7d0', color: '#0f172a' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ fontWeight: 700 }}>{t.title || (t.type === 'error' ? 'Erro' : 'Sucesso')}</div>
              {/* botão de fechar rápido para o usuário descartar a notificação */}
              <button onClick={() => removeToast(t.id)} style={{ border: 'none', background: 'transparent', cursor: 'pointer' }}>✕</button>
            </div>
            <div style={{ marginTop: 6, fontSize: 13 }}>{t.message}</div>
          </div>
        </div>
      ))}
    </div>
  )
}
