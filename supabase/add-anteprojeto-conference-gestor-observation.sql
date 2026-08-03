-- Adiciona a coluna gestorObservation na tabela AnteprojetoConference (Observação do Gestor ao devolver a conferência ao consultor).

ALTER TABLE "AnteprojetoConference"
ADD COLUMN IF NOT EXISTS "gestorObservation" text;
