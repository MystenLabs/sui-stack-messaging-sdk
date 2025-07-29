#!/usr/bin/env node

const fs = require("fs");
const path = require("path");

/**
 * Cleans summary JSON files by removing the setup_data section
 * @param {string} inputPath - Path to the input summary file
 * @param {string} outputPath - Path to save the cleaned file (optional)
 */
function cleanSummaryFile(inputPath, outputPath = null) {
  try {
    // Read the input file
    const data = fs.readFileSync(inputPath, "utf8");
    const summary = JSON.parse(data);

    // Remove setup_data if it exists
    if (summary.setup_data) {
      delete summary.setup_data;
      console.log(`✓ Removed setup_data from ${inputPath}`);
    } else {
      console.log(`⚠ No setup_data found in ${inputPath}`);
    }

    // Generate output path if not provided
    if (!outputPath) {
      const dir = path.dirname(inputPath);
      const basename = path.basename(inputPath, ".json");
      outputPath = path.join(dir, `${basename}_cleaned.json`);
    }

    // Write the cleaned data
    fs.writeFileSync(outputPath, JSON.stringify(summary, null, 2));
    console.log(`✓ Saved cleaned file to ${outputPath}`);

    return outputPath;
  } catch (error) {
    console.error(`✗ Error processing ${inputPath}:`, error.message);
    return null;
  }
}

/**
 * Processes all summary files in a directory
 * @param {string} directory - Directory containing summary files
 * @param {string} pattern - File pattern to match (default: summary_*.json)
 */
function processAllSummaryFiles(directory, pattern = "summary_*.json") {
  try {
    const files = fs.readdirSync(directory);
    const summaryFiles = files.filter((file) =>
      file.match(new RegExp(pattern.replace("*", ".*")))
    );

    if (summaryFiles.length === 0) {
      console.log(
        `No files matching pattern "${pattern}" found in ${directory}`
      );
      return;
    }

    console.log(`Found ${summaryFiles.length} summary files to process:`);
    summaryFiles.forEach((file) => console.log(`  - ${file}`));
    console.log("");

    const results = summaryFiles.map((file) => {
      const inputPath = path.join(directory, file);
      return cleanSummaryFile(inputPath);
    });

    const successful = results.filter((result) => result !== null);
    console.log(
      `\n✓ Successfully processed ${successful.length}/${summaryFiles.length} files`
    );
  } catch (error) {
    console.error(`✗ Error reading directory ${directory}:`, error.message);
  }
}

// CLI usage
if (require.main === module) {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    console.log("Usage:");
    console.log("  node clean-summary.js <input-file> [output-file]");
    console.log("  node clean-summary.js --all [directory] [pattern]");
    console.log("");
    console.log("Examples:");
    console.log(
      "  node clean-summary.js summary_4_16_1m_longer_polling_interval.testnet.json"
    );
    console.log("  node clean-summary.js --all .");
    console.log('  node clean-summary.js --all . "summary_*_testnet.json"');
    process.exit(1);
  }

  if (args[0] === "--all") {
    const directory = args[1] || ".";
    const pattern = args[2] || "summary_*.json";
    processAllSummaryFiles(directory, pattern);
  } else {
    const inputFile = args[0];
    const outputFile = args[1] || null;
    cleanSummaryFile(inputFile, outputFile);
  }
}

module.exports = { cleanSummaryFile, processAllSummaryFiles };
