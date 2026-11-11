# Giggle Studio (Türkçe)

[![Lisans: Apache-2.0](https://img.shields.io/badge/Lisans-Apache_2.0-blue.svg)](LICENSE)
[![Durum: Alfa](https://img.shields.io/badge/Durum-Alfa_0.1.0-orange.svg)](CHANGELOG.md)
[![Python: 3.11+](https://img.shields.io/badge/Python-3.11_|_3.12-blue.svg)](pyproject.toml)
[![Platform: Linux](https://img.shields.io/badge/Platform-Linux_(Pop!_OS/Ubuntu)-green.svg)](docs/PLAN.md)

> **Giggle Studio**, açık ağırlıklı büyük dil modellerini (LLM) yerel bilgisayarınızda çalıştırmanızı, modellerle sohbet etmenizi, kod yazmanızı, otonom agent süreçleri yürütmenizi, LoRA/QLoRA ile ince ayar (fine-tuning) yapmanızı ve yapay zeka destekli savunma amaçlı tersine mühendislik analizleri gerçekleştirmenizi sağlayan yerel öncelikli, açık kaynaklı bir stüdyodur.

---

## Öne Çıkan Özellikler

- **Kaynak Farkındalıklı Çıkarım (Inference):** Ana sunucudan yalıtılmış çalışan bağımsız işçi süreci. Model kapatıldığında VRAM'in OS seviyesinde sıfırlanması garantilenir. GGUF (`llama.cpp`) ve Hugging Face Transformers (`bitsandbytes` 4-bit) tam desteklenir.
- **Gelişmiş GPU/CPU Yerleşim Kontrolü:** Katman katman VRAM/RAM tahminleyicisi, KV-bellek kuantizasyonu (f16, q8_0, q4_0), MoE uzmanlarının CPU'ya aktarımı ve otomatik kıyaslama (benchmark) tüneli.
- **Kod Modu & Agent Modu:** Bubblewrap tabanlı güvenli Linux kumhavuzu (sandbox), çok dosyalı Monaco editörü, insan onayına dayalı eylem onay politikaları ve prompt-injection korumaları.
- **Eğitim Stüdyosu (LoRA / QLoRA SFT):** 12 GB VRAM sınırına uygun 4-bit NF4 ince ayar, bellek taşmasını önceden tespit eden deneme sürüşü (preflight), canlı kayıp (loss) grafikleri ve GGUF dışa aktarımı.
- **Savunmacı Tersine Mühendislik:** Karantinaya alınan yürütülemez örnek havuzu, statik ELF/PE analizi, çağrı çizgesi (call-graph) özetleyicisi ve doğrulanabilir kanıt alıntıları.
- **Gmail Entegrasyonu:** Kullanıcının kendi Google Cloud projesi ile OAuth 2.0 PKCE yetkilendirmesi, OS anahtarlığında şifreli saklanan belirteçler ve onaylı e-posta gönderimi.

---

## Test Edilen Donanım ve Sistem Gereksinimleri

Giggle Studio, özellikle 12 GB VRAM ve 16 GB RAM sınırlarına sahip modern donanımlarda kararlı çalışacak şekilde geliştirilmiştir:

- **İşletim Sistemi:** Pop!_OS 24.04 (Ubuntu tabanlı Linux)
- **Ekran Kartı (GPU):** NVIDIA GeForce RTX 5070 (12 GB VRAM, Blackwell mimarisi)
- **İşlemci (CPU):** Intel Core i5-10400F (6 Çekirdek / 12 İzlek)
- **Sistem Belleği (RAM):** 16 GB (Bellekte aynı anda iki model tutulmaz, RAM %85 tavan koruması mevcuttur)

---

## Hızlı Başlangıç

```bash
# 1. Projeyi klonlayın
git clone https://github.com/Sedat-gigglemorgan/giggle-studio.git
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

## Lisans

Giggle Studio, [Apache-2.0 Lisansı](LICENSE) altında dağıtılmaktadır.
Telif Hakkı © 2026 Sedat-gigglemorgan.
