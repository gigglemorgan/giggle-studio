# Giggle Studio (Türkçe)

[![Lisans: Apache-2.0](https://img.shields.io/badge/Lisans-Apache_2.0-blue.svg)](LICENSE)
[![Durum: Alfa](https://img.shields.io/badge/Durum-Alfa_0.1.0-orange.svg)](CHANGELOG.md)
[![Python: 3.11+](https://img.shields.io/badge/Python-3.11_|_3.12-blue.svg)](pyproject.toml)
[![Platform: Linux](https://img.shields.io/badge/Platform-Linux_(Pop!_OS/Ubuntu)-green.svg)](docs/PLAN.md)

> **Giggle Studio**, açık ağırlıklı büyük dil modellerini (LLM) yerel bilgisayarınızda çalıştırmanızı, modellerle sohbet etmenizi, kod yazmanızı, otonom agent süreçleri yürütmenizi, LoRA/QLoRA ile ince ayar (fine-tuning) yapmanızı ve yapay zeka destekli savunma amaçlı tersine mühendislik analizleri gerçekleştirmenizi sağlayan yerel öncelikli, açık kaynaklı bir stüdyodur.

---

## Özellikler ve Geliştirme Durumu

| Kategori | Yetenek | Durum |
| :--- | :--- | :---: |
| **Çıkarım Motoru (Inference)** | OS düzeyinde bellek iadesi sağlayan süpervizörlü bağımsız işçi süreci | Implemented |
| | `llama.cpp` ile GGUF model çalıştırma (CUDA sm_120 ve CPU yedekleme) | Implemented |
| | OpenAI uyumlu `/v1/chat/completions` uç noktası | Implemented |
| | Hugging Face Transformers ve `bitsandbytes` ile Safetensors çalıştırma | Planned |
| **Yerleşim & Offload** | Katman katman VRAM/RAM tahminleyicisi ve interaktif yerleşim paneli | Implemented |
| | KV-bellek kuantizasyonu (f16, q8_0, q4_0) | Implemented |
| | Otomatik kıyaslama merdiveni (`giggle bench`) | Implemented |
| | MoE uzman katmanlarının CPU'ya aktarımı | Planned |
| **Kod & Ajan Modu** | Linux Bubblewrap (`bwrap`) ile yalıtılmış kumhavuzu (sandbox) | Implemented |
| | Çok dosyalı Monaco editörü ve çalışma alanı ağacı | Implemented |
| | Adım adım insan onayı politikaları (`safe`, `write`, `exec`, `network`) | Implemented |
| | Ayrıştırılmış veri blokları ile prompt injection savunması | Implemented |
| | Model Context Protocol (MCP) JSON-RPC stdio istemcisi | Implemented |
| **Eğitim Stüdyosu (Training)** | Analitik bellek preflight deneme sürüşü hesaplayıcısı | Implemented |
| | Çoklu veri kümesi ayrıştırıcı (Alpaca, ShareGPT, OpenAI formatları) | Implemented |
| | Canlı SSE kayıp/VRAM grafikleri ile yalıtılmış SFT eğitim alt süreci | Implemented |
| | LoRA adaptör birleştirme ve Hugging Face model kartı üretimi | Implemented |
| | Birleştirme sonrası bağımsız GGUF kuantizasyon ihracı | Planned |
| | İsteğe bağlı Unsloth hızlandırma eklentisi | Planned |
| **Savunmacı Tersine Mühendislik** | SHA-256 tabanlı `0400` salt-okunur karantina havuzu | Implemented |
| | ELF ve PE ikili dosyaları için statik analiz ve kesit entropisi | Implemented |
| | Capstone ile x86/x64 ayrıştırıcı (disassembly) | Implemented |
| | Çağrı çizgesi (call-graph) analizi ve tabandan yukarı özetleme | Implemented |
| | İşlem kodu (opcode) hash önbellekli yapay zeka fonksiyon özetleri | Implemented |
| | Otomatik savunmacı YARA kuralı üretici | Implemented |
| | Geçici kumhavuzu dinamik analizi (`bwrap`) | Implemented |
| | Mach-O ayrıştırma ve Sigma kuralı taslaklama | Planned |
| | Vektörel anlamsal kod arama | Planned |
| **Gmail Entegrasyonu** | Masaüstü OAuth 2.0 PKCE döngüsel yetkilendirmesi | Implemented |
| | OS anahtarlığında şifreli belirteç saklama (Fernet + keyring) | Implemented |
| | Ayrıntılı denetim günlüğü (`gmail_audit`) ve ileti önbelleği | Implemented |
| | İnsan onaylı taslak oluşturma ve e-posta gönderimi | Implemented |

---

## Geliştirme Yapılan Sistem ve Donanım Gereksinimleri

Giggle Studio, özellikle 12 GB VRAM ve 16 GB RAM sınırlarına sahip modern donanımlarda kararlı çalışacak şekilde geliştirilmiştir:

| Bileşen | Geliştirme Yapılan Sistem | Desteklenen Asgari |
| :--- | :--- | :--- |
| **İşletim Sistemi** | Pop!_OS 24.04 (Linux x86_64) | Linux (çekirdek >= 5.15) ve bubblewrap |
| **Ekran Kartı (GPU)** | NVIDIA GeForce RTX 5070 (12 GB VRAM, sm_120) | NVIDIA GPU (8 GB+ VRAM) veya CPU yedekleme |
| **İşlemci (CPU)** | Intel Core i5-10400F (6 Çekirdek / 12 İzlek) | AVX2 destekli 4 çekirdekli x86_64 |
| **Sistem Belleği (RAM)** | 16 GB DDR4 | 16 GB önerilir (%85 tavan koruması) |
| **Depolama** | NVMe SSD (hızlı) + HDD (veri havuzu) | Modeller için en az 20 GB boş disk alanı |

---

## Hızlı Başlangıç

```bash
# 1. Projeyi klonlayın
git clone https://github.com/gigglemorgan/giggle-studio.git
cd giggle-studio

# 2. Otomatik kurulum betiğini çalıştırın
./scripts/setup.sh

# 3. Sistem gereksinimlerini kontrol edin
python3 scripts/doctor.py

# 4. Giggle Studio'yu başlatın
./scripts/run.sh
```
Tarayıcınızda `http://127.0.0.1:8420` adresine gidin.

---

## Görsel Arayüz Galerisi

Giggle Studio; Linear ve Raycast kalitesinde koyu grafit teması, elektrik lime vurgu rengi, tamamen yerel barındırılan tipografi (Inter & JetBrains Mono), duyarlı panel yerleşimleri ve eksiksiz açık/koyu tema desteği ile tasarlanmıştır.

| Görünüm (Koyu Tema) | Görünüm (Açık Tema) |
| :--- | :--- |
| **Sohbet & Düşünce Akışı**<br><img src="docs/screenshots/chat-dark.png" width="480" alt="Sohbet Koyu" /> | **Sohbet (Açık)**<br><img src="docs/screenshots/chat-light.png" width="480" alt="Sohbet Açık" /> |
| **Model Yöneticisi & Yerleşim/Offload Planlayıcı**<br><img src="docs/screenshots/models-dark.png" width="480" alt="Modeller Koyu" /> | **Model Yöneticisi (Açık)**<br><img src="docs/screenshots/models-light.png" width="480" alt="Modeller Açık" /> |
| **Kod Stüdyosu & Monaco IDE**<br><img src="docs/screenshots/code-dark.png" width="480" alt="Kod Koyu" /> | **Kod Stüdyosu (Açık)**<br><img src="docs/screenshots/code-light.png" width="480" alt="Kod Açık" /> |
| **Otonom Agent & Onay Mekanizması**<br><img src="docs/screenshots/agent-dark.png" width="480" alt="Agent Koyu" /> | **Otonom Agent (Açık)**<br><img src="docs/screenshots/agent-light.png" width="480" alt="Agent Açık" /> |
| **Model Eğitim Stüdyosu & Preflight**<br><img src="docs/screenshots/training-dark.png" width="480" alt="Eğitim Koyu" /> | **Model Eğitim Stüdyosu (Açık)**<br><img src="docs/screenshots/training-light.png" width="480" alt="Eğitim Açık" /> |
| **Tersine Mühendislik Tezgahı**<br><img src="docs/screenshots/re-dark.png" width="480" alt="Tersine Mühendislik Koyu" /> | **Tersine Mühendislik (Açık)**<br><img src="docs/screenshots/re-light.png" width="480" alt="Tersine Mühendislik Açık" /> |
| **Donanım & VRAM Telemetrisi**<br><img src="docs/screenshots/resources-dark.png" width="480" alt="Kaynaklar Koyu" /> | **Donanım Telemetrisi (Açık)**<br><img src="docs/screenshots/resources-light.png" width="480" alt="Kaynaklar Açık" /> |

---

## Lisans

Giggle Studio, [Apache-2.0 Lisansı](LICENSE) altında dağıtılmaktadır.
Telif Hakkı © 2026 Sedat-gigglemorgan.
