import requests
import os
from urllib.parse import urlparse

# All official IRS links (public domain)
urls = {
    "forms": [
        "https://www.irs.gov/pub/irs-pdf/f433a.pdf",
        "https://www.irs.gov/pub/irs-pdf/f433aoi.pdf",
        "https://www.irs.gov/pub/irs-pdf/f433b.pdf",
        "https://www.irs.gov/pub/irs-pdf/f433boi.pdf",
        "https://www.irs.gov/pub/irs-pdf/f656.pdf",
        "https://www.irs.gov/pub/irs-pdf/f656b.pdf",
        "https://www.irs.gov/pub/irs-pdf/f9465.pdf",
        "https://www.irs.gov/pub/irs-pdf/f8857.pdf",
        "https://www.irs.gov/pub/irs-pdf/f843.pdf",
    ],
    "pubs": [
        "https://www.irs.gov/pub/irs-pdf/p594.pdf",
        "https://www.irs.gov/pub/irs-pdf/p1.pdf",
        "https://www.irs.gov/pub/irs-pdf/p1660.pdf",
        "https://www.irs.gov/pub/irs-pdf/p556.pdf",
        "https://www.irs.gov/pub/irs-pdf/p971.pdf",
    ],
    "other": [
        "https://www.irs.gov/pub/irs-pdf/pcir230.pdf",
        "https://www.irs.gov/pub/irs-drop/rp-13-34.pdf",
    ]
}

# Put everything neatly into public/irs_kb/
target_folder = "../public/irs_kb"
os.makedirs(target_folder, exist_ok=True)

def download_file(url, folder):
    filename = os.path.basename(urlparse(url).path)
    path = os.path.join(folder, filename)
    if os.path.exists(path):
        print(f"✓ Already exists: {filename}")
        return
    print(f"Downloading {filename}...")
    r = requests.get(url, stream=True)
    if r.status_code == 200:
        with open(path, 'wb') as f:
            for chunk in r.iter_content(8192):
                f.write(chunk)
        print(f"✓ Saved: public/irs_kb/{filename}")
    else:
        print(f"✗ Failed: {url}")

print("Starting IRS Knowledge Base download...\n")
for category, link_list in urls.items():
    for url in link_list:
        download_file(url, target_folder)

print("\n✅ All files downloaded to public/irs_kb/ !")
print("You can now commit them and use in your app (RAG, /public, etc.).")
