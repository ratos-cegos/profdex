-- O cooldown de batalha da mesma dupla passou de HORAS para MINUTOS, para
-- poder ficar abaixo de uma hora durante o evento (ver `battlePairCooldownMinutes`
-- em src/settings/settings.ts).
--
-- Converte o valor que o painel já gravou. Sem isto, a chave nova nasceria
-- vazia e o cooldown voltaria sozinho ao padrão de 12h no deploy, desfazendo o
-- que alguém ajustou. Sem linha antiga (nunca mexeram no painel), nada muda: o
-- padrão continua 12h, agora escrito como 720 minutos.
--
-- Só converte valor que é número inteiro. Qualquer outra coisa a leitura já
-- trocava pelo padrão (`parseSetting`), e um CAST que falhasse aqui derrubaria
-- o boot do servidor no deploy.
INSERT INTO "app_settings" ("key", "value", "updated_at")
SELECT 'battle.pair_cooldown_minutes', (CAST(TRIM("value") AS INTEGER) * 60)::TEXT, NOW()
FROM "app_settings"
WHERE "key" = 'battle.pair_cooldown_hours'
  AND TRIM("value") ~ '^[0-9]{1,6}$'
ON CONFLICT ("key") DO NOTHING;

DELETE FROM "app_settings" WHERE "key" = 'battle.pair_cooldown_hours';
