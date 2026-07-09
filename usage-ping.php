<?php
/**
 * usage-ping.php
 * -----------------------------------------------------------
 * Anonymní počítadlo použití Dashboardu K-S.
 * Neukládá se ŽÁDNÁ osobní informace (žádná IP, žádné jméno,
 * žádný email) – jen se zvýší číslo o 1 v souboru usage-count.json.
 *
 * Pokud je v URL parametr ?peek=1, číslo se JEN VRÁTÍ, ale NEZVÝŠÍ
 * (používá se pro vlastníka webu, aby viděl počet, aniž by ho navyšoval).
 * -----------------------------------------------------------
 */

header('Content-Type: application/json');
// Povolíme volání odkudkoliv (protože dashboard běží i lokálně u lidí doma)
header('Access-Control-Allow-Origin: *');

$counterFile = __DIR__ . '/data/usage-count.json';

// Pokud soubor s počítadlem ještě neexistuje, založíme ho s hodnotou 0
if (!file_exists($counterFile)) {
    file_put_contents($counterFile, json_encode(['count' => 0]));
}

// Načteme aktuální počet
$data = json_decode(file_get_contents($counterFile), true);
if (!is_array($data) || !isset($data['count'])) {
    $data = ['count' => 0];
}

// Zjistíme, jestli jde jen o "nahlédnutí" (bez navýšení)
$isPeek = isset($_GET['peek']) && $_GET['peek'] === '1';

if (!$isPeek) {
    // Zvýšíme o 1
    $data['count'] = $data['count'] + 1;
    $data['last_ping'] = date('Y-m-d H:i:s'); // jen datum/čas posledního spuštění, ne kdo

    // Uložíme zpět
    file_put_contents($counterFile, json_encode($data));
}

// Odpovíme jednoduše "ok"
echo json_encode(['status' => 'ok', 'count' => $data['count']]);
