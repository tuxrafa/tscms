# Processamento

O upload valida o tipo pelo conteúdo:

- PNG, JPEG, WebP e GIF são imagens.
- PDF é documento e fica disponível para download, sem conversão.
- SVG é recusado. Ele pode carregar conteúdo ativo e não é servido como HTML.

Imagens diferentes de GIF passam pelo Sharp. A orientação EXIF é aplicada com `rotate()`. Os presets iniciais são thumbnail 200, small 480, medium 768, large 1200 e xlarge 1920. Um preset maior que o original não é gerado e a imagem não é ampliada. A saída é WebP.

O original permanece na versão. Uma nova versão grava outro original e novas renditions. As renditions antigas continuam endereçáveis pela URL versionada.

O limite deste corte é 20 MB por arquivo. Vídeo, áudio e prévia de PDF ficam para um worker separado; o recorte atual não depende de FFmpeg nem de LibreOffice.
