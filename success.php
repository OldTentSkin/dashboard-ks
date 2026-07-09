<?php
/**
 * success.php
 * Stránka, na kterou Stripe přesměruje zákazníka po úspěšné platbě.
 * Zobrazí mu jeho odemykací kód.
 */

$sessionId = $_GET['session_id'] ?? '';
$licensesFile = __DIR__ . '/licenses.json';

function loadLicenses($file) {
    return file_exists($file)
        ? json_decode(file_get_contents($file), true)
        : ['sessions' => [], 'codes' => []];
}

$code = null;
$tries = 0;
$maxTries = 8; // čekáme na webhook, který kód vygeneruje (může dorazit s malým zpožděním)

while ($tries < $maxTries) {
    $licenses = loadLicenses($licensesFile);
    if (isset($licenses['sessions'][$sessionId])) {
        $code = $licenses['sessions'][$sessionId]['code'];
        break;
    }
    sleep(1);
    $tries++;
}
?>
<!DOCTYPE html>
<html lang="cs">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Děkujeme za nákup — Dashboard K-S</title>
<link href="https://fonts.googleapis.com/css2?family=Share+Tech+Mono&family=Rajdhani:wght@600;700&display=swap" rel="stylesheet">
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    background: #030303;
    color: #e8d9b0;
    font-family: 'Share Tech Mono', monospace;
    display: flex; align-items: center; justify-content: center;
    min-height: 100vh; padding: 20px;
  }
  .box {
    text-align: center; padding: 40px 30px;
    border: 1px solid rgba(200,160,60,0.3); border-radius: 16px;
    max-width: 480px; width: 100%;
    background: radial-gradient(ellipse at 0% 0%, #c89820 0%, #6a4a00 20%, #1a1000 50%, #000000 100%);
  }
  h1 {
    font-family: 'Rajdhani', sans-serif; font-size: 24px;
    letter-spacing: 2px; color: #c8a03c; text-transform: uppercase;
    margin-bottom: 16px;
  }
  .code {
    font-size: 26px; letter-spacing: 3px; color: #c8a03c;
    margin: 20px 0; padding: 16px;
    border: 1px dashed rgba(200,160,60,0.5); border-radius: 8px;
    word-break: break-all;
  }
  p { line-height: 1.6; font-size: 13px; color: rgba(232,217,176,0.8); margin-bottom: 10px; }
  a { color: #c8a03c; }
</style>
</head>
<body>
  <div class="box">
    <h1>Děkujeme za nákup!</h1>
    <?php if ($code): ?>
      <p>Tvůj odemykací kód pro motiv MATRIX2026:</p>
      <div class="code"><?= htmlspecialchars($code) ?></div>
      <p>Zadej ho v appce v <strong>Nastavení → Motivy</strong>. Kód jde použít na až 3 zařízeních.</p>
    <?php else: ?>
      <p>Kód se ještě zpracovává (může to trvat pár vteřin).</p>
      <p>Zkus prosím <a href="javascript:location.reload()">stránku obnovit</a>, nebo se podívej do e-mailu od Stripe s potvrzením nákupu.</p>
    <?php endif; ?>
    <p style="margin-top:20px;"><a href="index.html">← Zpět na dashboard</a></p>
  </div>
</body>
</html>
