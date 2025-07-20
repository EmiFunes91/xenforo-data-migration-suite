<?php
/**
 * XenForo Import Script
 * 
 * This script imports all SQL chunks in the correct order.
 * Run this from your XenForo admin panel or via command line.
 */

// Configuration
$chunk_dir = __DIR__;
$total_chunks = 1;

echo "Starting XenForo import process...\n";
echo "Total chunks to import: $total_chunks\n\n";

$success_count = 0;
$error_count = 0;

for ($i = 1; $i <= $total_chunks; $i++) {
    $chunk_file = $chunk_dir . "/import_chunk_001.sql";
    
    if (!file_exists($chunk_file)) {
        echo "❌ Chunk file not found: $chunk_file\n";
        $error_count++;
        continue;
    }
    
    echo "📦 Importing chunk $i of $total_chunks... ";
    
    try {
        // Read the SQL file
        $sql = file_get_contents($chunk_file);
        
        // Split into individual statements
        $statements = array_filter(array_map('trim', explode(';', $sql)));
        
        $chunk_success = 0;
        $chunk_errors = 0;
        
        foreach ($statements as $statement) {
            if (empty($statement) || strpos($statement, '--') === 0) {
                continue;
            }
            
            try {
                // Execute the statement
                $result = $db->query($statement);
                $chunk_success++;
            } catch (Exception $e) {
                $chunk_errors++;
                echo "\n   ⚠️  Statement error: " . substr($statement, 0, 50) . "...\n";
            }
        }
        
        echo "✅ Success: $chunk_success statements, Errors: $chunk_errors\n";
        $success_count++;
        
    } catch (Exception $e) {
        echo "❌ Failed: " . $e->getMessage() . "\n";
        $error_count++;
    }
    
    // Small delay to prevent overwhelming the server
    usleep(100000); // 0.1 seconds
}

echo "\n🎉 Import completed!\n";
echo "✅ Successful chunks: $success_count\n";
echo "❌ Failed chunks: $error_count\n";
echo "📊 Total statements imported: " . ($success_count * 100) . " (estimated)\n";
?>
