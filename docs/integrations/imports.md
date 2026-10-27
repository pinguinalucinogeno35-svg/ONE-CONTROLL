# Importação CSV/XLSX

Tela: Clientes → Importar. Formatos: CSV (`;`, `,` ou tab; UTF-8 ou Windows-1252) e XLSX
(primeira planilha). Limites: 900 KB e 1.000 linhas por lote.

Colunas reconhecidas (sem acento/caixa): `nome_contato|contato|nome`, `nome_empresa|empresa|razao_social`,
`email|e-mail`, `whatsapp|telefone|celular`, `instagram`, `cnpj|cpf|documento`,
`descricao|servicos`. Obrigatórias: contato e empresa.

Fluxo: **Pré-visualizar** (mapeamento, linhas inválidas com motivo, amostra) → **Importar**
(somente linhas válidas). No banco (`import_clients_batch`): vendedor só importa para a própria
carteira; duplicidade por e-mail/WhatsApp na carteira é rejeitada por linha; CNPJ/CPF validado;
o mesmo arquivo (hash SHA-256) não é importado duas vezes para a mesma carteira; o resultado
fica em `import_jobs` e na auditoria.
