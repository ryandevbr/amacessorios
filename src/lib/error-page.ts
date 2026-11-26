export function renderErrorPage(): string {
  return `<!doctype html>
<html lang="pt-BR">
  <head>
    <meta charset="utf-8" />
    <title>AM Acessórios e Makes — Erro ao carregar</title>
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <style>
      body { font: 15px/1.5 system-ui, -apple-system, sans-serif; background: #F7F3ED; color: #2B1E14; display: grid; place-items: center; min-height: 100vh; margin: 0; padding: 1.5rem; }
      .card { max-width: 28rem; width: 100%; text-align: center; padding: 2rem; }
      h1 { font-size: 1.25rem; margin: 0 0 0.5rem; }
      p { color: #6E5B4B; margin: 0 0 1.5rem; }
      .actions { display: flex; gap: 0.5rem; justify-content: center; flex-wrap: wrap; }
      a, button { padding: 0.5rem 1rem; border-radius: 0.375rem; font: inherit; cursor: pointer; text-decoration: none; border: 1px solid transparent; }
      .primary { background: #84582E; color: #FFFDF9; }
      .secondary { background: #EFE8DE; color: #2B1E14; border-color: #D4B492; }
    </style>
  </head>
  <body>
    <div class="card">
      <h1>Não foi possível carregar esta página</h1>
      <p>Ocorreu um erro inesperado. Você pode tentar novamente ou voltar para a vitrine da AM Acessórios e Makes.</p>
      <div class="actions">
        <button class="primary" onclick="location.reload()">Tentar novamente</button>
        <a class="secondary" href="/">Voltar ao início</a>
      </div>
    </div>
  </body>
</html>`;
}
