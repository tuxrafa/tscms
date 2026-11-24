# Monólito modular

O primeiro processo é único. Management, Delivery e interações públicas compartilham o banco e o código de domínio, com controllers separados.

Microsserviços ficam fora desta fase. A fila BullMQ já tem um worker próprio para não prender a retentativa de webhook ao tempo da requisição quando `RUN_WORKER=1`.
