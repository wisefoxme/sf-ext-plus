# get the latest .vsix file from the current directory for signing with keybase
# Find the latest .vsix file in the current directory
latest_vsix=$(find . -name "*.vsix" -type f -print0 | xargs -0 ls -t | head -n 1)

if [ -z "$latest_vsix" ]; then
    echo "No .vsix files found in the current directory."
    exit 1
fi

echo "Found latest .vsix file: $latest_vsix"

# You can now use $latest_vsix variable for signing with keybase
keybase sign -i "$latest_vsix" -o "signatures/${latest_vsix%.vsix}.vsix.sig" --detached
