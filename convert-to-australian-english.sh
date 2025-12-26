#!/bin/bash
# Convert American English to Australian English throughout the codebase
# Focuses on user-facing content while preserving code identifiers

echo "🇦🇺 Converting to Australian English..."
echo ""

# Convert user-facing content files
echo "Converting TypeScript/TSX files..."
find src/components src/app -type f \( -name "*.tsx" -o -name "*.ts" \) -exec perl -pi -e '
  s/\boptimize\b/optimise/g;
  s/\boptimizes\b/optimises/g;
  s/\boptimized\b/optimised/g;
  s/\boptimizing\b/optimising/g;
  s/\boptimization\b/optimisation/g;
  s/\boptimizations\b/optimisations/g;
  s/\bprioritize\b/prioritise/g;
  s/\bprioritizes\b/prioritises/g;
  s/\bprioritized\b/prioritised/g;
  s/\bprioritizing\b/prioritising/g;
  s/\bcategorize\b/categorise/g;
  s/\bcategorizes\b/categorises/g;
  s/\bcategorized\b/categorised/g;
  s/\bcategorizing\b/categorising/g;
  s/\bcustomize\b/customise/g;
  s/\bcustomizes\b/customises/g;
  s/\bcustomized\b/customised/g;
  s/\bcustomizing\b/customising/g;
  s/\brealize\b/realise/g;
  s/\brealizes\b/realises/g;
  s/\brealized\b/realised/g;
  s/\brealizing\b/realising/g;
  s/\brecognize\b/recognise/g;
  s/\brecognizes\b/recognises/g;
  s/\brecognized\b/recognised/g;
  s/\brecognizing\b/recognising/g;
  s/\bsummarize\b/summarise/g;
  s/\bsummarizes\b/summarises/g;
  s/\bsummarized\b/summarised/g;
  s/\bsummarizing\b/summarising/g;
  s/\banalyze\b/analyse/g;
  s/\banalyzes\b/analyses/g;
  s/\banalyzed\b/analysed/g;
  s/\banalyzing\b/analysing/g;
  s/\borganization\b/organisation/g;
  s/\borganizations\b/organisations/g;
  s/\bcolor\b/colour/g;
  s/\bcolors\b/colours/g;
  s/\bcolored\b/coloured/g;
  s/\bcoloring\b/colouring/g;
  s/\bcenter\b/centre/g;
  s/\bcenters\b/centres/g;
  s/\bcentered\b/centred/g;
  s/\bcentering\b/centring/g;
  s/\bdefense\b/defence/g;
  s/\bdefenses\b/defences/g;
  s/\bcatalog\b/catalogue/g;
  s/\bcatalogs\b/catalogues/g;
  s/\bdialog\b/dialogue/g;
  s/\bdialogs\b/dialogues/g;
' {} +

# Convert documentation files
echo "Converting documentation files..."
find docs -type f -name "*.md" -exec perl -pi -e '
  s/\boptimize\b/optimise/g;
  s/\boptimizes\b/optimises/g;
  s/\boptimized\b/optimised/g;
  s/\boptimizing\b/optimising/g;
  s/\boptimization\b/optimisation/g;
  s/\boptimizations\b/optimisations/g;
  s/\bprioritize\b/prioritise/g;
  s/\bprioritizes\b/prioritises/g;
  s/\bprioritized\b/prioritised/g;
  s/\bprioritizing\b/prioritising/g;
  s/\bcategorize\b/categorise/g;
  s/\bcategorizes\b/categorises/g;
  s/\bcategorized\b/categorised/g;
  s/\bcategorizing\b/categorising/g;
  s/\bcustomize\b/customise/g;
  s/\bcustomizes\b/customises/g;
  s/\bcustomized\b/customised/g;
  s/\bcustomizing\b/customising/g;
  s/\brealize\b/realise/g;
  s/\brealizes\b/realises/g;
  s/\brealized\b/realised/g;
  s/\brealizing\b/realising/g;
  s/\brecognize\b/recognise/g;
  s/\brecognizes\b/recognises/g;
  s/\brecognized\b/recognised/g;
  s/\brecognizing\b/recognising/g;
  s/\bsummarize\b/summarise/g;
  s/\bsummarizes\b/summarises/g;
  s/\bsummarized\b/summarised/g;
  s/\bsummarizing\b/summarising/g;
  s/\banalyze\b/analyse/g;
  s/\banalyzes\b/analyses/g;
  s/\banalyzed\b/analysed/g;
  s/\banalyzing\b/analysing/g;
  s/\borganization\b/organisation/g;
  s/\borganizations\b/organisations/g;
  s/\bcolor\b/colour/g;
  s/\bcolors\b/colours/g;
  s/\bcolored\b/coloured/g;
  s/\bcoloring\b/colouring/g;
  s/\bcenter\b/centre/g;
  s/\bcenters\b/centres/g;
  s/\bcentered\b/centred/g;
  s/\bcentering\b/centring/g;
  s/\bdefense\b/defence/g;
  s/\bdefenses\b/defences/g;
  s/\bcatalog\b/catalogue/g;
  s/\bcatalogs\b/catalogues/g;
  s/\bdialog\b/dialogue/g;
  s/\bdialogs\b/dialogues/g;
' {} +

echo ""
echo "✅ Conversion complete!"
echo ""
echo "Checking results..."
git diff --stat | head -20
