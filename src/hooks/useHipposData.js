import { useState, useEffect, useMemo, useRef } from 'react';
import { supabase } from '../services/supabase';

const DEFAULT_PRODUCTS = [
  { id: 1001, kategori: 'İÇECEKLER', altKategori: 'Sıcak İçeçekler', ad: 'ÇAY BÜYÜK', fiyat: 30, durum: 'AKTIF', menuSirasi: 1, sabit: false, azPorsiyon: false, azFiyat: null, parentId: null, isAzVariant: false },
  { id: 1002, kategori: 'İÇECEKLER', altKategori: 'Sıcak İçeçekler', ad: 'ÇAY KÜÇÜK', fiyat: 20, durum: 'AKTIF', menuSirasi: 2, sabit: false, azPorsiyon: false, azFiyat: null, parentId: null, isAzVariant: false },
  { id: 1003, kategori: 'İÇECEKLER', altKategori: 'Sıcak İçeçekler', ad: 'Nescafe Sütlü', fiyat: 80, durum: 'AKTIF', menuSirasi: 3, sabit: false, azPorsiyon: false, azFiyat: null, parentId: null, isAzVariant: false },
  { id: 1004, kategori: 'İÇECEKLER', altKategori: 'Sıcak İçeçekler', ad: 'Nescafe Sütsüz', fiyat: 80, durum: 'AKTIF', menuSirasi: 4, sabit: false, azPorsiyon: false, azFiyat: null, parentId: null, isAzVariant: false },
  { id: 1005, kategori: 'İÇECEKLER', altKategori: 'Sıcak İçeçekler', ad: 'Türk Kahvesi ( Sade )', fiyat: 80, durum: 'AKTIF', menuSirasi: 5, sabit: false, azPorsiyon: false, azFiyat: null, parentId: null, isAzVariant: false },
  { id: 1006, kategori: 'İÇECEKLER', altKategori: 'Sıcak İçeçekler', ad: 'Türk Kahvesi ( Orta Şekerli )', fiyat: 80, durum: 'AKTIF', menuSirasi: 6, sabit: false, azPorsiyon: false, azFiyat: null, parentId: null, isAzVariant: false },
  { id: 1007, kategori: 'İÇECEKLER', altKategori: 'Sıcak İçeçekler', ad: 'Türk kahvesi ( Şekerli )', fiyat: 80, durum: 'AKTIF', menuSirasi: 7, sabit: false, azPorsiyon: false, azFiyat: null, parentId: null, isAzVariant: false },
  { id: 1008, kategori: 'İÇECEKLER', altKategori: 'Sıcak İçeçekler', ad: 'Süt', fiyat: 70, durum: 'AKTIF', menuSirasi: 8, sabit: false, azPorsiyon: false, azFiyat: null, parentId: null, isAzVariant: false },
  { id: 1009, kategori: 'İÇECEKLER', altKategori: 'Sıcak İçeçekler', ad: 'Filtre kahve', fiyat: 80, durum: 'AKTIF', menuSirasi: 9, sabit: false, azPorsiyon: false, azFiyat: null, parentId: null, isAzVariant: false },
  { id: 1010, kategori: 'İÇECEKLER', altKategori: 'Soğuk İçeçekler', ad: 'Çamlıca Gazoz', fiyat: 60, durum: 'AKTIF', menuSirasi: 50, sabit: false, azPorsiyon: false, azFiyat: null, parentId: null, isAzVariant: false },
  { id: 1011, kategori: 'İÇECEKLER', altKategori: 'Soğuk İçeçekler', ad: 'Kutu Meyve Suyu', fiyat: 45, durum: 'AKTIF', menuSirasi: 1, sabit: false, azPorsiyon: false, azFiyat: null, parentId: null, isAzVariant: false },
  { id: 1012, kategori: 'İÇECEKLER', altKategori: 'Soğuk İçeçekler', ad: 'CAPPY VİŞNE', fiyat: 80, durum: 'AKTIF', menuSirasi: 10, sabit: false, azPorsiyon: false, azFiyat: null, parentId: null, isAzVariant: false },
  { id: 1013, kategori: 'İÇECEKLER', altKategori: 'Soğuk İçeçekler', ad: 'Schwaps Mandalina', fiyat: 80, durum: 'AKTIF', menuSirasi: 100, sabit: false, azPorsiyon: false, azFiyat: null, parentId: null, isAzVariant: false },
  { id: 1014, kategori: 'İÇECEKLER', altKategori: 'Soğuk İçeçekler', ad: 'Schwaps Limon', fiyat: 80, durum: 'AKTIF', menuSirasi: 100, sabit: false, azPorsiyon: false, azFiyat: null, parentId: null, isAzVariant: false },
  { id: 1015, kategori: 'İÇECEKLER', altKategori: 'Soğuk İçeçekler', ad: 'TAZE PORTAKAL SUYU', fiyat: 150, durum: 'AKTIF', menuSirasi: 50, sabit: false, azPorsiyon: false, azFiyat: null, parentId: null, isAzVariant: false },
  { id: 1016, kategori: 'İÇECEKLER', altKategori: 'Soğuk İçeçekler', ad: 'CAPPY KARIŞIK', fiyat: 80, durum: 'AKTIF', menuSirasi: 11, sabit: false, azPorsiyon: false, azFiyat: null, parentId: null, isAzVariant: false },
  { id: 1017, kategori: 'İÇECEKLER', altKategori: 'Soğuk İçeçekler', ad: 'ŞALGAM SUYU', fiyat: 80, durum: 'AKTIF', menuSirasi: 12, sabit: false, azPorsiyon: false, azFiyat: null, parentId: null, isAzVariant: false },
  { id: 1018, kategori: 'İÇECEKLER', altKategori: 'Soğuk İçeçekler', ad: 'SADE SODA', fiyat: 40, durum: 'AKTIF', menuSirasi: 13, sabit: false, azPorsiyon: false, azFiyat: null, parentId: null, isAzVariant: false },
  { id: 1019, kategori: 'İÇECEKLER', altKategori: 'Soğuk İçeçekler', ad: 'LİMONLU SODA', fiyat: 45, durum: 'AKTIF', menuSirasi: 14, sabit: false, azPorsiyon: false, azFiyat: null, parentId: null, isAzVariant: false },
  { id: 1020, kategori: 'İÇECEKLER', altKategori: 'Soğuk İçeçekler', ad: 'SPRİTE', fiyat: 80, durum: 'AKTIF', menuSirasi: 15, sabit: false, azPorsiyon: false, azFiyat: null, parentId: null, isAzVariant: false },
  { id: 1021, kategori: 'İÇECEKLER', altKategori: 'Soğuk İçeçekler', ad: 'SU', fiyat: 20, durum: 'AKTIF', menuSirasi: 2, sabit: false, azPorsiyon: false, azFiyat: null, parentId: null, isAzVariant: false },
  { id: 1022, kategori: 'İÇECEKLER', altKategori: 'Soğuk İçeçekler', ad: 'LİMONATA', fiyat: 80, durum: 'AKTIF', menuSirasi: 50, sabit: false, azPorsiyon: false, azFiyat: null, parentId: null, isAzVariant: false },
  { id: 1023, kategori: 'İÇECEKLER', altKategori: 'Soğuk İçeçekler', ad: 'AYRAN', fiyat: 50, durum: 'AKTIF', menuSirasi: 3, sabit: false, azPorsiyon: false, azFiyat: null, parentId: null, isAzVariant: false },
  { id: 1024, kategori: 'İÇECEKLER', altKategori: 'Soğuk İçeçekler', ad: 'FANTA', fiyat: 80, durum: 'AKTIF', menuSirasi: 4, sabit: false, azPorsiyon: false, azFiyat: null, parentId: null, isAzVariant: false },
  { id: 1025, kategori: 'İÇECEKLER', altKategori: 'Soğuk İçeçekler', ad: 'COCA COLA', fiyat: 80, durum: 'AKTIF', menuSirasi: 5, sabit: false, azPorsiyon: false, azFiyat: null, parentId: null, isAzVariant: false },
  { id: 1026, kategori: 'İÇECEKLER', altKategori: 'Soğuk İçeçekler', ad: 'COCA COLA ZERO', fiyat: 80, durum: 'AKTIF', menuSirasi: 6, sabit: false, azPorsiyon: false, azFiyat: null, parentId: null, isAzVariant: false },
  { id: 1027, kategori: 'İÇECEKLER', altKategori: 'Soğuk İçeçekler', ad: 'İce Tea Limon', fiyat: 80, durum: 'AKTIF', menuSirasi: 7, sabit: false, azPorsiyon: false, azFiyat: null, parentId: null, isAzVariant: false },
  { id: 1028, kategori: 'İÇECEKLER', altKategori: 'Soğuk İçeçekler', ad: 'İce Tea Şeftali', fiyat: 80, durum: 'AKTIF', menuSirasi: 8, sabit: false, azPorsiyon: false, azFiyat: null, parentId: null, isAzVariant: false },
  { id: 1029, kategori: 'İÇECEKLER', altKategori: 'Soğuk İçeçekler', ad: 'CAPPY PULPY', fiyat: 80, durum: 'AKTIF', menuSirasi: 9, sabit: false, azPorsiyon: false, azFiyat: null, parentId: null, isAzVariant: false },
  { id: 1030, kategori: 'KAHVALTI', altKategori: 'Kahvaltı Çeşitleri', ad: 'Porselen Tabak', fiyat: 0, durum: 'AKTIF', menuSirasi: 1, sabit: false, azPorsiyon: false, azFiyat: null, parentId: null, isAzVariant: false },
  { id: 1031, kategori: 'KAHVALTI', altKategori: 'Kahvaltı Çeşitleri', ad: 'Köpük Tabak', fiyat: 0, durum: 'AKTIF', menuSirasi: 2, sabit: false, azPorsiyon: false, azFiyat: null, parentId: null, isAzVariant: false },
  { id: 1032, kategori: 'KAHVALTI', altKategori: 'Kahvaltı Çeşitleri', ad: 'Domates .Kah.', fiyat: 15, durum: 'AKTIF', menuSirasi: 3, sabit: false, azPorsiyon: false, azFiyat: null, parentId: null, isAzVariant: false },
  { id: 1033, kategori: 'KAHVALTI', altKategori: 'Kahvaltı Çeşitleri', ad: 'Dilim Salatalık Kah.', fiyat: 15, durum: 'AKTIF', menuSirasi: 4, sabit: false, azPorsiyon: false, azFiyat: null, parentId: null, isAzVariant: false },
  { id: 1034, kategori: 'KAHVALTI', altKategori: 'Kahvaltı Çeşitleri', ad: 'BEYAZ PEYNİR Kah.', fiyat: 40, durum: 'AKTIF', menuSirasi: 5, sabit: false, azPorsiyon: false, azFiyat: null, parentId: null, isAzVariant: false },
  { id: 1035, kategori: 'KAHVALTI', altKategori: 'Kahvaltı Çeşitleri', ad: 'KAŞAR Kah.', fiyat: 17, durum: 'AKTIF', menuSirasi: 6, sabit: false, azPorsiyon: false, azFiyat: null, parentId: null, isAzVariant: false },
  { id: 1036, kategori: 'KAHVALTI', altKategori: 'Kahvaltı Çeşitleri', ad: 'ESKİ KAŞAR(DİLİMİ) Kah.', fiyat: 24, durum: 'AKTIF', menuSirasi: 7, sabit: false, azPorsiyon: false, azFiyat: null, parentId: null, isAzVariant: false },
  { id: 1037, kategori: 'KAHVALTI', altKategori: 'Kahvaltı Çeşitleri', ad: 'BURGER (ÇEDAR ) PEYNİRİ Kah.', fiyat: 40, durum: 'AKTIF', menuSirasi: 8, sabit: false, azPorsiyon: false, azFiyat: null, parentId: null, isAzVariant: false },
  { id: 1038, kategori: 'KAHVALTI', altKategori: 'Kahvaltı Çeşitleri', ad: 'YUMURTA Kah.', fiyat: 18, durum: 'AKTIF', menuSirasi: 9, sabit: false, azPorsiyon: false, azFiyat: null, parentId: null, isAzVariant: false },
  { id: 1039, kategori: 'KAHVALTI', altKategori: 'Kahvaltı Çeşitleri', ad: 'Zeytin (KAHVALTI TABAK )', fiyat: 23, durum: 'AKTIF', menuSirasi: 10, sabit: false, azPorsiyon: false, azFiyat: null, parentId: null, isAzVariant: false },
  { id: 1040, kategori: 'KAHVALTI', altKategori: 'Kahvaltı Çeşitleri', ad: 'DANA JAMBON (DİLİMİ) Kah.', fiyat: 40, durum: 'AKTIF', menuSirasi: 11, sabit: false, azPorsiyon: false, azFiyat: null, parentId: null, isAzVariant: false },
  { id: 1041, kategori: 'KAHVALTI', altKategori: 'Kahvaltı Çeşitleri', ad: 'TAVUK JAMBON Kah.', fiyat: 22, durum: 'AKTIF', menuSirasi: 12, sabit: false, azPorsiyon: false, azFiyat: null, parentId: null, isAzVariant: false },
  { id: 1042, kategori: 'KAHVALTI', altKategori: 'Kahvaltı Çeşitleri', ad: 'Patates Kızartma ( 1 Tutam) Kah.', fiyat: 23, durum: 'AKTIF', menuSirasi: 13, sabit: false, azPorsiyon: false, azFiyat: null, parentId: null, isAzVariant: false },
  { id: 1043, kategori: 'KAHVALTI', altKategori: 'Kahvaltı Çeşitleri', ad: 'SALAM Kah.', fiyat: 17, durum: 'AKTIF', menuSirasi: 14, sabit: false, azPorsiyon: false, azFiyat: null, parentId: null, isAzVariant: false },
  { id: 1044, kategori: 'KAHVALTI', altKategori: 'Kahvaltı Çeşitleri', ad: 'SOSİS Kah.', fiyat: 16, durum: 'AKTIF', menuSirasi: 15, sabit: false, azPorsiyon: false, azFiyat: null, parentId: null, isAzVariant: false },
  { id: 1045, kategori: 'KAHVALTI', altKategori: 'Kahvaltı Çeşitleri', ad: 'Sosisli Patat.(2 Kşk) Kah.', fiyat: 46, durum: 'AKTIF', menuSirasi: 16, sabit: false, azPorsiyon: false, azFiyat: null, parentId: null, isAzVariant: false },
  { id: 1046, kategori: 'KAHVALTI', altKategori: 'Kahvaltı Çeşitleri', ad: 'Acılı Ezme B. Kah.', fiyat: 18, durum: 'AKTIF', menuSirasi: 17, sabit: false, azPorsiyon: false, azFiyat: null, parentId: null, isAzVariant: false },
  { id: 1047, kategori: 'KAHVALTI', altKategori: 'Kahvaltı Çeşitleri', ad: 'Amerikan', fiyat: 30, durum: 'AKTIF', menuSirasi: 18, sabit: false, azPorsiyon: false, azFiyat: null, parentId: null, isAzVariant: false },
  { id: 1048, kategori: 'KAHVALTI', altKategori: 'Kahvaltı Çeşitleri', ad: 'KREM PEYNİR Kah.', fiyat: 24, durum: 'AKTIF', menuSirasi: 19, sabit: false, azPorsiyon: false, azFiyat: null, parentId: null, isAzVariant: false },
  { id: 1049, kategori: 'KAHVALTI', altKategori: 'Kahvaltı Çeşitleri', ad: 'ZEYTİN EZMESİ Kah.', fiyat: 36, durum: 'AKTIF', menuSirasi: 50, sabit: false, azPorsiyon: false, azFiyat: null, parentId: null, isAzVariant: false },
  { id: 1050, kategori: 'KAHVALTI', altKategori: 'Kahvaltı Çeşitleri', ad: 'Biber T. Kah.', fiyat: 13, durum: 'AKTIF', menuSirasi: 21, sabit: false, azPorsiyon: false, azFiyat: null, parentId: null, isAzVariant: false },
  { id: 1051, kategori: 'KAHVALTI', altKategori: 'Kahvaltı Çeşitleri', ad: 'KIVIRCIK Kah.', fiyat: 17, durum: 'AKTIF', menuSirasi: 22, sabit: false, azPorsiyon: false, azFiyat: null, parentId: null, isAzVariant: false },
  { id: 1052, kategori: 'KAHVALTI', altKategori: 'Kahvaltı Çeşitleri', ad: 'MAYDONOZ Kah.', fiyat: 17, durum: 'AKTIF', menuSirasi: 23, sabit: false, azPorsiyon: false, azFiyat: null, parentId: null, isAzVariant: false },
  { id: 1053, kategori: 'KAHVALTI', altKategori: 'Kahvaltı Çeşitleri', ad: 'Roka Kah.', fiyat: 17, durum: 'AKTIF', menuSirasi: 24, sabit: false, azPorsiyon: false, azFiyat: null, parentId: null, isAzVariant: false },
  { id: 1054, kategori: 'KAHVALTI', altKategori: 'Kahvaltı Çeşitleri', ad: 'KAVURMA (DİLİMİ) Kah.', fiyat: 83, durum: 'AKTIF', menuSirasi: 25, sabit: false, azPorsiyon: false, azFiyat: null, parentId: null, isAzVariant: false },
  { id: 1055, kategori: 'KAHVALTI', altKategori: 'Kahvaltı Çeşitleri', ad: 'Turşu Dilim Kah.', fiyat: 15, durum: 'AKTIF', menuSirasi: 26, sabit: false, azPorsiyon: false, azFiyat: null, parentId: null, isAzVariant: false },
  { id: 1056, kategori: 'KAHVALTI', altKategori: 'Kahvaltı Çeşitleri', ad: 'ÇEKİRDEKLİ Siyah Zeytin Kah.', fiyat: 23, durum: 'AKTIF', menuSirasi: 29, sabit: false, azPorsiyon: false, azFiyat: null, parentId: null, isAzVariant: false },
  { id: 1057, kategori: 'KAHVALTI', altKategori: 'Kahvaltı Çeşitleri', ad: 'Kesik Siyah Zeytin Kah.', fiyat: 23, durum: 'AKTIF', menuSirasi: 30, sabit: false, azPorsiyon: false, azFiyat: null, parentId: null, isAzVariant: false },
  { id: 1058, kategori: 'KAHVALTI', altKategori: 'Kahvaltı Çeşitleri', ad: 'ÇEKİRDEKLİ Yeşil Zeytin', fiyat: 23, durum: 'AKTIF', menuSirasi: 31, sabit: false, azPorsiyon: false, azFiyat: null, parentId: null, isAzVariant: false },
  { id: 1059, kategori: 'KAHVALTI', altKategori: 'Kahvaltı Çeşitleri', ad: 'Kesik Yeşil Zeytin Kah.', fiyat: 23, durum: 'AKTIF', menuSirasi: 32, sabit: false, azPorsiyon: false, azFiyat: null, parentId: null, isAzVariant: false },
  { id: 1060, kategori: 'KAHVALTI', altKategori: 'Kahvaltı Çeşitleri', ad: 'Bal', fiyat: 40, durum: 'AKTIF', menuSirasi: 33, sabit: false, azPorsiyon: false, azFiyat: null, parentId: null, isAzVariant: false },
  { id: 1061, kategori: 'KAHVALTI', altKategori: 'Kahvaltı Çeşitleri', ad: 'KAYMAK Kah.', fiyat: 100, durum: 'AKTIF', menuSirasi: 34, sabit: false, azPorsiyon: false, azFiyat: null, parentId: null, isAzVariant: false },
  { id: 1062, kategori: 'KAHVALTI', altKategori: 'Kahvaltı Çeşitleri', ad: 'ÇİKOLATA Kah.', fiyat: 41, durum: 'AKTIF', menuSirasi: 35, sabit: false, azPorsiyon: false, azFiyat: null, parentId: null, isAzVariant: false },
  { id: 1063, kategori: 'KAHVALTI', altKategori: 'Kahvaltı Çeşitleri', ad: 'BAL-KAYMAK (Büy.Joker)', fiyat: 107, durum: 'AKTIF', menuSirasi: 37, sabit: false, azPorsiyon: false, azFiyat: null, parentId: null, isAzVariant: false },
  { id: 1064, kategori: 'KAHVALTI', altKategori: 'Kahvaltı Çeşitleri', ad: 'Bal Kaymak (Küç.Joker)', fiyat: 81, durum: 'AKTIF', menuSirasi: 38, sabit: false, azPorsiyon: false, azFiyat: null, parentId: null, isAzVariant: false },
  { id: 1065, kategori: 'KAHVALTI', altKategori: 'Kahvaltı Çeşitleri', ad: 'Helva 1 Dlm (Kahv.)', fiyat: 17, durum: 'AKTIF', menuSirasi: 38, sabit: false, azPorsiyon: false, azFiyat: null, parentId: null, isAzVariant: false },
  { id: 1066, kategori: 'KAHVALTI', altKategori: 'Kahvaltı Tabağı', ad: 'MİNİ KAHVALTI TABAĞI', fiyat: 180, durum: 'AKTIF', menuSirasi: 1, sabit: false, azPorsiyon: false, azFiyat: null, parentId: null, isAzVariant: false },
  { id: 1067, kategori: 'KAHVALTI', altKategori: 'Kahvaltı Tabağı', ad: 'Standart Kahvaltı Tabağı', fiyat: 305, durum: 'AKTIF', menuSirasi: 2, sabit: false, azPorsiyon: false, azFiyat: null, parentId: null, isAzVariant: false },
  { id: 1068, kategori: 'KAHVALTI', altKategori: 'Kahvaltı Tabağı', ad: 'Bol Çeşit Kahvaltı Tabağı', fiyat: 415, durum: 'AKTIF', menuSirasi: 3, sabit: false, azPorsiyon: false, azFiyat: null, parentId: null, isAzVariant: false },
  { id: 1069, kategori: 'KAHVALTI', altKategori: 'Pastahane Çeşitleri', ad: 'Peynirli Börek', fiyat: 30, durum: 'AKTIF', menuSirasi: 1, sabit: false, azPorsiyon: false, azFiyat: null, parentId: null, isAzVariant: false },
  { id: 1070, kategori: 'KAHVALTI', altKategori: 'Pastahane Çeşitleri', ad: 'Patatesli Sigara Böreği', fiyat: 30, durum: 'AKTIF', menuSirasi: 2, sabit: false, azPorsiyon: false, azFiyat: null, parentId: null, isAzVariant: false },
  { id: 1071, kategori: 'KAHVALTI', altKategori: 'Pastahane Çeşitleri', ad: 'Ispanaklı Börek', fiyat: 30, durum: 'AKTIF', menuSirasi: 3, sabit: false, azPorsiyon: false, azFiyat: null, parentId: null, isAzVariant: false },
  { id: 1072, kategori: 'KAHVALTI', altKategori: 'Pastahane Çeşitleri', ad: 'Peynirli Poğaça', fiyat: 25, durum: 'AKTIF', menuSirasi: 4, sabit: false, azPorsiyon: false, azFiyat: null, parentId: null, isAzVariant: false },
  { id: 1073, kategori: 'KAHVALTI', altKategori: 'Pastahane Çeşitleri', ad: 'Sade Poğaça', fiyat: 25, durum: 'AKTIF', menuSirasi: 6, sabit: false, azPorsiyon: false, azFiyat: null, parentId: null, isAzVariant: false },
  { id: 1074, kategori: 'SALATALAR', altKategori: 'BÜYÜK Salata', ad: 'BÜYÜK SADE Salata', fiyat: 150, durum: 'AKTIF', menuSirasi: 1, sabit: false, azPorsiyon: false, azFiyat: null, parentId: null, isAzVariant: false },
  { id: 1075, kategori: 'SALATALAR', altKategori: 'BÜYÜK Salata', ad: 'Büyük T. HAŞLAMA Salata', fiyat: 250, durum: 'AKTIF', menuSirasi: 2, sabit: false, azPorsiyon: false, azFiyat: null, parentId: null, isAzVariant: false },
  { id: 1076, kategori: 'SALATALAR', altKategori: 'BÜYÜK Salata', ad: 'Büyük T. JULYEN Salata', fiyat: 250, durum: 'AKTIF', menuSirasi: 3, sabit: false, azPorsiyon: false, azFiyat: null, parentId: null, isAzVariant: false },
  { id: 1077, kategori: 'SALATALAR', altKategori: 'BÜYÜK Salata', ad: 'BÜYÜK TON Balıklı Salata', fiyat: 265, durum: 'AKTIF', menuSirasi: 4, sabit: false, azPorsiyon: false, azFiyat: null, parentId: null, isAzVariant: false },
  { id: 1078, kategori: 'SALATALAR', altKategori: 'BÜYÜK Salata', ad: 'BÜYÜK BEYAZ Peynir Salata', fiyat: 215, durum: 'AKTIF', menuSirasi: 5, sabit: false, azPorsiyon: false, azFiyat: null, parentId: null, isAzVariant: false },
  { id: 1079, kategori: 'SALATALAR', altKategori: 'BÜYÜK Salata', ad: 'BÜYÜK KAŞAR Peynir Salata,', fiyat: 215, durum: 'AKTIF', menuSirasi: 6, sabit: false, azPorsiyon: false, azFiyat: null, parentId: null, isAzVariant: false },
  { id: 1080, kategori: 'SALATALAR', altKategori: 'BÜYÜK Salata', ad: 'BÜYÜK T. SCHNITZEL Salata', fiyat: 250, durum: 'AKTIF', menuSirasi: 7, sabit: false, azPorsiyon: false, azFiyat: null, parentId: null, isAzVariant: false },
  { id: 1081, kategori: 'SALATALAR', altKategori: 'BÜYÜK Salata', ad: 'BÜYÜK KARIŞIK Salata', fiyat: 295, durum: 'AKTIF', menuSirasi: 8, sabit: false, azPorsiyon: false, azFiyat: null, parentId: null, isAzVariant: false },
  { id: 1082, kategori: 'SALATALAR', altKategori: 'Küçük Salata', ad: 'Küçük SADE Salata', fiyat: 115, durum: 'AKTIF', menuSirasi: 1, sabit: false, azPorsiyon: false, azFiyat: null, parentId: null, isAzVariant: false },
  { id: 1083, kategori: 'SALATALAR', altKategori: 'Küçük Salata', ad: 'Ekstra Ton Balığı', fiyat: 120, durum: 'AKTIF', menuSirasi: 10, sabit: false, azPorsiyon: false, azFiyat: null, parentId: null, isAzVariant: false },
  { id: 1084, kategori: 'SALATALAR', altKategori: 'Küçük Salata', ad: 'Ekstra Tavuk', fiyat: 120, durum: 'AKTIF', menuSirasi: 11, sabit: false, azPorsiyon: false, azFiyat: null, parentId: null, isAzVariant: false },
  { id: 1085, kategori: 'SALATALAR', altKategori: 'Küçük Salata', ad: 'Küçük T. HAŞLAMA Salata', fiyat: 225, durum: 'AKTIF', menuSirasi: 2, sabit: false, azPorsiyon: false, azFiyat: null, parentId: null, isAzVariant: false },
  { id: 1086, kategori: 'SALATALAR', altKategori: 'Küçük Salata', ad: 'Küçük T. JULYEN Salata', fiyat: 225, durum: 'AKTIF', menuSirasi: 3, sabit: false, azPorsiyon: false, azFiyat: null, parentId: null, isAzVariant: false },
  { id: 1087, kategori: 'SALATALAR', altKategori: 'Küçük Salata', ad: 'Küçük TON Balıklı Salata', fiyat: 215, durum: 'AKTIF', menuSirasi: 4, sabit: false, azPorsiyon: false, azFiyat: null, parentId: null, isAzVariant: false },
  { id: 1088, kategori: 'SALATALAR', altKategori: 'Küçük Salata', ad: 'Küçük BEYAZ Peynirli Salata', fiyat: 190, durum: 'AKTIF', menuSirasi: 5, sabit: false, azPorsiyon: false, azFiyat: null, parentId: null, isAzVariant: false },
  { id: 1089, kategori: 'SALATALAR', altKategori: 'Küçük Salata', ad: 'Küçük KAŞAR Peynirli Salata', fiyat: 190, durum: 'AKTIF', menuSirasi: 6, sabit: false, azPorsiyon: false, azFiyat: null, parentId: null, isAzVariant: false },
  { id: 1090, kategori: 'SALATALAR', altKategori: 'Küçük Salata', ad: 'Küçük T. SCHNİTZEL Salata', fiyat: 225, durum: 'AKTIF', menuSirasi: 7, sabit: false, azPorsiyon: false, azFiyat: null, parentId: null, isAzVariant: false },
  { id: 1091, kategori: 'SALATALAR', altKategori: 'Küçük Salata', ad: 'Küçük KARIŞIK Salata', fiyat: 250, durum: 'AKTIF', menuSirasi: 8, sabit: false, azPorsiyon: false, azFiyat: null, parentId: null, isAzVariant: false },
  { id: 1092, kategori: 'SICAK SANDVİÇ', altKategori: 'BÜYÜK Sıcak Sandviç', ad: 'F. YARIM Köfte-Çedar', fiyat: 235, durum: 'AKTIF', menuSirasi: 11, sabit: false, azPorsiyon: false, azFiyat: null, parentId: null, isAzVariant: false },
  { id: 1093, kategori: 'SICAK SANDVİÇ', altKategori: 'BÜYÜK Sıcak Sandviç', ad: 'F. YARIM Köfte + Yeşillik', fiyat: 205, durum: 'AKTIF', menuSirasi: 11, sabit: false, azPorsiyon: false, azFiyat: null, parentId: null, isAzVariant: false },
  { id: 1094, kategori: 'SICAK SANDVİÇ', altKategori: 'BÜYÜK Sıcak Sandviç', ad: 'F. YARIM Köfte-Kaşar', fiyat: 230, durum: 'AKTIF', menuSirasi: 12, sabit: false, azPorsiyon: false, azFiyat: null, parentId: null, isAzVariant: false },
  { id: 1095, kategori: 'SICAK SANDVİÇ', altKategori: 'BÜYÜK Sıcak Sandviç', ad: 'F. YARIM Köfte-KAŞAR-ÇEDAR', fiyat: 250, durum: 'AKTIF', menuSirasi: 12, sabit: false, azPorsiyon: false, azFiyat: null, parentId: null, isAzVariant: false },
  { id: 1096, kategori: 'SICAK SANDVİÇ', altKategori: 'BÜYÜK Sıcak Sandviç', ad: 'F.. YARIM Kadınbudu +YEŞİLLİK', fiyat: 340, durum: 'AKTIF', menuSirasi: 13, sabit: false, azPorsiyon: false, azFiyat: null, parentId: null, isAzVariant: false },
  { id: 1097, kategori: 'SICAK SANDVİÇ', altKategori: 'BÜYÜK Sıcak Sandviç', ad: 'F. YARIM Kadınbudu +Kaşar', fiyat: 375, durum: 'AKTIF', menuSirasi: 14, sabit: false, azPorsiyon: false, azFiyat: null, parentId: null, isAzVariant: false },
  { id: 1098, kategori: 'SICAK SANDVİÇ', altKategori: 'BÜYÜK Sıcak Sandviç', ad: 'F. YARIM Kadınbudu +Çedar', fiyat: 380, durum: 'AKTIF', menuSirasi: 15, sabit: false, azPorsiyon: false, azFiyat: null, parentId: null, isAzVariant: false },
  { id: 1099, kategori: 'SICAK SANDVİÇ', altKategori: 'BÜYÜK Sıcak Sandviç', ad: 'F. YARIM Kadınbudu +Kaşar+Çedar', fiyat: 395, durum: 'AKTIF', menuSirasi: 16, sabit: false, azPorsiyon: false, azFiyat: null, parentId: null, isAzVariant: false },
  { id: 1100, kategori: 'SICAK SANDVİÇ', altKategori: 'BÜYÜK Sıcak Sandviç', ad: 'S.YARIM TAVUKLU+yeşillikli', fiyat: 135, durum: 'AKTIF', menuSirasi: 17, sabit: false, azPorsiyon: false, azFiyat: null, parentId: null, isAzVariant: false },
  { id: 1101, kategori: 'SICAK SANDVİÇ', altKategori: 'BÜYÜK Sıcak Sandviç', ad: 'F. YARIM TAVUKLU+ÇEDAR', fiyat: 195, durum: 'AKTIF', menuSirasi: 19, sabit: false, azPorsiyon: false, azFiyat: null, parentId: null, isAzVariant: false },
  { id: 1102, kategori: 'SICAK SANDVİÇ', altKategori: 'BÜYÜK Sıcak Sandviç', ad: 'F. YARIM Kavurma-Kaşar', fiyat: 225, durum: 'AKTIF', menuSirasi: 2, sabit: false, azPorsiyon: false, azFiyat: null, parentId: null, isAzVariant: false },
  { id: 1103, kategori: 'SICAK SANDVİÇ', altKategori: 'BÜYÜK Sıcak Sandviç', ad: 'F. YARIM T. JULYEN +KAŞAR', fiyat: 155, durum: 'AKTIF', menuSirasi: 22, sabit: false, azPorsiyon: false, azFiyat: null, parentId: null, isAzVariant: false },
  { id: 1104, kategori: 'SICAK SANDVİÇ', altKategori: 'BÜYÜK Sıcak Sandviç', ad: 'F. YARIM T. JULYEN +ÇEDAR', fiyat: 160, durum: 'AKTIF', menuSirasi: 23, sabit: false, azPorsiyon: false, azFiyat: null, parentId: null, isAzVariant: false },
  { id: 1105, kategori: 'SICAK SANDVİÇ', altKategori: 'BÜYÜK Sıcak Sandviç', ad: 'F. YARIM T. JULYEN +KAŞAR+ÇEDAR', fiyat: 175, durum: 'AKTIF', menuSirasi: 24, sabit: false, azPorsiyon: false, azFiyat: null, parentId: null, isAzVariant: false },
  { id: 1106, kategori: 'SICAK SANDVİÇ', altKategori: 'BÜYÜK Sıcak Sandviç', ad: 'S. YARIM T. Schnitsel +YEŞİLLİK', fiyat: 170, durum: 'AKTIF', menuSirasi: 25, sabit: false, azPorsiyon: false, azFiyat: null, parentId: null, isAzVariant: false },
  { id: 1107, kategori: 'SICAK SANDVİÇ', altKategori: 'BÜYÜK Sıcak Sandviç', ad: 'F.YARIM Kavurma-Çedar', fiyat: 220, durum: 'AKTIF', menuSirasi: 3, sabit: false, azPorsiyon: false, azFiyat: null, parentId: null, isAzVariant: false },
  { id: 1108, kategori: 'SICAK SANDVİÇ', altKategori: 'BÜYÜK Sıcak Sandviç', ad: 'F.YARIM Kavurma Kaşar-Çedar', fiyat: 245, durum: 'AKTIF', menuSirasi: 4, sabit: false, azPorsiyon: false, azFiyat: null, parentId: null, isAzVariant: false },
  { id: 1109, kategori: 'SICAK SANDVİÇ', altKategori: 'BÜYÜK Sıcak Sandviç', ad: 'F. YARIM Sosis-Kaşar', fiyat: 140, durum: 'AKTIF', menuSirasi: 6, sabit: false, azPorsiyon: false, azFiyat: null, parentId: null, isAzVariant: false },
  { id: 1110, kategori: 'SICAK SANDVİÇ', altKategori: 'Küçük Sıcak Sandviç', ad: 'KÜÇÜK KAVURMA-KAŞAR', fiyat: 160, durum: 'AKTIF', menuSirasi: 1, sabit: false, azPorsiyon: false, azFiyat: null, parentId: null, isAzVariant: false },
  { id: 1111, kategori: 'SICAK SANDVİÇ', altKategori: 'Küçük Sıcak Sandviç', ad: 'KÜÇÜK KÖFTE-KAŞAR', fiyat: 155, durum: 'AKTIF', menuSirasi: 10, sabit: false, azPorsiyon: false, azFiyat: null, parentId: null, isAzVariant: false },
  { id: 1112, kategori: 'SICAK SANDVİÇ', altKategori: 'Küçük Sıcak Sandviç', ad: 'KÜÇÜK TAVUK-KAŞAR', fiyat: 110, durum: 'AKTIF', menuSirasi: 100, sabit: false, azPorsiyon: false, azFiyat: null, parentId: null, isAzVariant: false },
  { id: 1113, kategori: 'SICAK SANDVİÇ', altKategori: 'Küçük Sıcak Sandviç', ad: 'KÜÇÜK KÖFTE-ÇEDAR', fiyat: 165, durum: 'AKTIF', menuSirasi: 11, sabit: false, azPorsiyon: false, azFiyat: null, parentId: null, isAzVariant: false },
  { id: 1114, kategori: 'SICAK SANDVİÇ', altKategori: 'Küçük Sıcak Sandviç', ad: 'kÜÇÜK KÖFTE KAŞAR / ÇEDAR', fiyat: 185, durum: 'AKTIF', menuSirasi: 12, sabit: false, azPorsiyon: false, azFiyat: null, parentId: null, isAzVariant: false },
  { id: 1115, kategori: 'SICAK SANDVİÇ', altKategori: 'Küçük Sıcak Sandviç', ad: 'TAVUK KÜÇÜK', fiyat: 105, durum: 'AKTIF', menuSirasi: 13, sabit: false, azPorsiyon: false, azFiyat: null, parentId: null, isAzVariant: false },
  { id: 1116, kategori: 'SICAK SANDVİÇ', altKategori: 'Küçük Sıcak Sandviç', ad: 'KÜÇÜK KAVURMA-ÇEDAR', fiyat: 175, durum: 'AKTIF', menuSirasi: 2, sabit: false, azPorsiyon: false, azFiyat: null, parentId: null, isAzVariant: false },
  { id: 1117, kategori: 'SICAK SANDVİÇ', altKategori: 'Küçük Sıcak Sandviç', ad: 'KÜÇÜK KAVURMA/KAŞAR/ÇEDAR', fiyat: 190, durum: 'AKTIF', menuSirasi: 3, sabit: false, azPorsiyon: false, azFiyat: null, parentId: null, isAzVariant: false },
  { id: 1118, kategori: 'SICAK SANDVİÇ', altKategori: 'Küçük Sıcak Sandviç', ad: 'KÜÇÜK SOSİS-KAŞAR', fiyat: 95, durum: 'AKTIF', menuSirasi: 6, sabit: false, azPorsiyon: false, azFiyat: null, parentId: null, isAzVariant: false },
  { id: 1119, kategori: 'SICAK SANDVİÇ', altKategori: 'Küçük Sıcak Sandviç', ad: 'KÜÇÜK SOSİS / ÇEDAR', fiyat: 100, durum: 'AKTIF', menuSirasi: 7, sabit: false, azPorsiyon: false, azFiyat: null, parentId: null, isAzVariant: false },
  { id: 1120, kategori: 'SICAK SANDVİÇ', altKategori: 'Küçük Sıcak Sandviç', ad: 'KÜÇÜK SOSİS/KAŞAR/ÇEDAR', fiyat: 115, durum: 'AKTIF', menuSirasi: 8, sabit: false, azPorsiyon: false, azFiyat: null, parentId: null, isAzVariant: false },
  { id: 1121, kategori: 'SICAK SANDVİÇ', altKategori: 'Küçük Sıcak Sandviç', ad: 'KÖFTE KÜÇÜK', fiyat: 150, durum: 'AKTIF', menuSirasi: 9, sabit: false, azPorsiyon: false, azFiyat: null, parentId: null, isAzVariant: false },
  { id: 1122, kategori: 'SICAK SANDVİÇ', altKategori: 'Sıcak Tabak', ad: 'PATATES KIZARTMASI PORS.', fiyat: 140, durum: 'AKTIF', menuSirasi: 1, sabit: false, azPorsiyon: false, azFiyat: null, parentId: null, isAzVariant: false },
  { id: 1123, kategori: 'SICAK YUMURTA', altKategori: 'Melemen', ad: 'Sade MENEMEN', fiyat: 120, durum: 'AKTIF', menuSirasi: 1, sabit: false, azPorsiyon: false, azFiyat: null, parentId: null, isAzVariant: false },
  { id: 1124, kategori: 'SICAK YUMURTA', altKategori: 'Melemen', ad: 'Karışık Menemen', fiyat: 220, durum: 'AKTIF', menuSirasi: 100, sabit: false, azPorsiyon: false, azFiyat: null, parentId: null, isAzVariant: false },
  { id: 1125, kategori: 'SICAK YUMURTA', altKategori: 'Melemen', ad: 'Peynirli Menemen', fiyat: 160, durum: 'AKTIF', menuSirasi: 2, sabit: false, azPorsiyon: false, azFiyat: null, parentId: null, isAzVariant: false },
  { id: 1126, kategori: 'SICAK YUMURTA', altKategori: 'Melemen', ad: 'KAŞARLI MENEMEN', fiyat: 160, durum: 'AKTIF', menuSirasi: 3, sabit: false, azPorsiyon: false, azFiyat: null, parentId: null, isAzVariant: false },
  { id: 1127, kategori: 'SICAK YUMURTA', altKategori: 'Melemen', ad: 'Sucuklu Menemen', fiyat: 160, durum: 'AKTIF', menuSirasi: 4, sabit: false, azPorsiyon: false, azFiyat: null, parentId: null, isAzVariant: false },
  { id: 1128, kategori: 'SICAK YUMURTA', altKategori: 'Melemen', ad: 'KAVURMALI MENEMEN', fiyat: 205, durum: 'AKTIF', menuSirasi: 5, sabit: false, azPorsiyon: false, azFiyat: null, parentId: null, isAzVariant: false },
  { id: 1129, kategori: 'SICAK YUMURTA', altKategori: 'Melemen', ad: 'Kavurmalı-Kaşarlı Melemen', fiyat: 225, durum: 'AKTIF', menuSirasi: 5, sabit: false, azPorsiyon: false, azFiyat: null, parentId: null, isAzVariant: false },
  { id: 1130, kategori: 'SICAK YUMURTA', altKategori: 'Omlet', ad: 'Sade Omlet', fiyat: 105, durum: 'AKTIF', menuSirasi: 1, sabit: false, azPorsiyon: false, azFiyat: null, parentId: null, isAzVariant: false },
  { id: 1131, kategori: 'SICAK YUMURTA', altKategori: 'Omlet', ad: 'KAŞ. SUCUK OMLET', fiyat: 160, durum: 'AKTIF', menuSirasi: 100, sabit: false, azPorsiyon: false, azFiyat: null, parentId: null, isAzVariant: false },
  { id: 1132, kategori: 'SICAK YUMURTA', altKategori: 'Omlet', ad: 'Sucuklu Omlet', fiyat: 130, durum: 'AKTIF', menuSirasi: 100, sabit: false, azPorsiyon: false, azFiyat: null, parentId: null, isAzVariant: false },
  { id: 1133, kategori: 'SICAK YUMURTA', altKategori: 'Omlet', ad: 'Peynirli Omlet', fiyat: 155, durum: 'AKTIF', menuSirasi: 2, sabit: false, azPorsiyon: false, azFiyat: null, parentId: null, isAzVariant: false },
  { id: 1134, kategori: 'SICAK YUMURTA', altKategori: 'Omlet', ad: 'KAŞARLI OMLET', fiyat: 155, durum: 'AKTIF', menuSirasi: 3, sabit: false, azPorsiyon: false, azFiyat: null, parentId: null, isAzVariant: false },
  { id: 1135, kategori: 'SICAK YUMURTA', altKategori: 'Omlet', ad: 'KAVURMALI OMLET', fiyat: 205, durum: 'AKTIF', menuSirasi: 3, sabit: false, azPorsiyon: false, azFiyat: null, parentId: null, isAzVariant: false },
  { id: 1136, kategori: 'SICAK YUMURTA', altKategori: 'Sahanda Yumurta', ad: 'sade SAHANDA YUMURTA', fiyat: 120, durum: 'AKTIF', menuSirasi: 1, sabit: false, azPorsiyon: false, azFiyat: null, parentId: null, isAzVariant: false },
  { id: 1137, kategori: 'SICAK YUMURTA', altKategori: 'Sahanda Yumurta', ad: 'KAVURMALI SAHANDA YUMURTA', fiyat: 205, durum: 'AKTIF', menuSirasi: 100, sabit: false, azPorsiyon: false, azFiyat: null, parentId: null, isAzVariant: false },
  { id: 1138, kategori: 'SICAK YUMURTA', altKategori: 'Sahanda Yumurta', ad: 'PEYNİRLİ SAHANDA YUMURTA', fiyat: 140, durum: 'AKTIF', menuSirasi: 3, sabit: false, azPorsiyon: false, azFiyat: null, parentId: null, isAzVariant: false },
  { id: 1139, kategori: 'SICAK YUMURTA', altKategori: 'Sahanda Yumurta', ad: 'Kaşarlı Sahanda Yumurta', fiyat: 140, durum: 'AKTIF', menuSirasi: 3, sabit: false, azPorsiyon: false, azFiyat: null, parentId: null, isAzVariant: false },
  { id: 1140, kategori: 'SICAK YUMURTA', altKategori: 'Sahanda Yumurta', ad: 'Sucuklu Sahanda Yumurta', fiyat: 150, durum: 'AKTIF', menuSirasi: 5, sabit: false, azPorsiyon: false, azFiyat: null, parentId: null, isAzVariant: false },
  { id: 1141, kategori: 'SOĞUK SANDVİÇ', altKategori: 'BÜYÜK Sandviç', ad: '01-BÜYÜK BEYAZ Ekmek', fiyat: 50, durum: 'AKTIF', menuSirasi: 1, sabit: false, azPorsiyon: false, azFiyat: null, parentId: null, isAzVariant: false },
  { id: 1142, kategori: 'SOĞUK SANDVİÇ', altKategori: 'BÜYÜK Sandviç', ad: '02- BÜYÜK ***KEPEKLİ*** Ekmek', fiyat: 50, durum: 'AKTIF', menuSirasi: 2, sabit: false, azPorsiyon: false, azFiyat: null, parentId: null, isAzVariant: false },
  { id: 1143, kategori: 'SOĞUK SANDVİÇ', altKategori: 'BÜYÜK Sandviç', ad: '08- Domates B.', fiyat: 6, durum: 'AKTIF', menuSirasi: 3, sabit: false, azPorsiyon: false, azFiyat: null, parentId: null, isAzVariant: false },
  { id: 1144, kategori: 'SOĞUK SANDVİÇ', altKategori: 'BÜYÜK Sandviç', ad: '09- Dilim Salatalık B', fiyat: 6, durum: 'AKTIF', menuSirasi: 4, sabit: false, azPorsiyon: false, azFiyat: null, parentId: null, isAzVariant: false },
  { id: 1145, kategori: 'SOĞUK SANDVİÇ', altKategori: 'BÜYÜK Sandviç', ad: '10- Beyaz Peyn. B(3 Dlm)', fiyat: 56, durum: 'AKTIF', menuSirasi: 5, sabit: false, azPorsiyon: false, azFiyat: null, parentId: null, isAzVariant: false },
  { id: 1146, kategori: 'SOĞUK SANDVİÇ', altKategori: 'BÜYÜK Sandviç', ad: '11-Kaşar B.(4 Dlm)', fiyat: 23, durum: 'AKTIF', menuSirasi: 6, sabit: false, azPorsiyon: false, azFiyat: null, parentId: null, isAzVariant: false },
  { id: 1147, kategori: 'SOĞUK SANDVİÇ', altKategori: 'BÜYÜK Sandviç', ad: '12-Eski Kaşar B.(2 Dlm)', fiyat: 40, durum: 'AKTIF', menuSirasi: 7, sabit: false, azPorsiyon: false, azFiyat: null, parentId: null, isAzVariant: false },
  { id: 1148, kategori: 'SOĞUK SANDVİÇ', altKategori: 'BÜYÜK Sandviç', ad: '13-Çedar B (3 DLM)', fiyat: 34, durum: 'AKTIF', menuSirasi: 8, sabit: false, azPorsiyon: false, azFiyat: null, parentId: null, isAzVariant: false },
  { id: 1149, kategori: 'SOĞUK SANDVİÇ', altKategori: 'BÜYÜK Sandviç', ad: '14-Yumurta B(1 Adt )', fiyat: 18, durum: 'AKTIF', menuSirasi: 9, sabit: false, azPorsiyon: false, azFiyat: null, parentId: null, isAzVariant: false },
  { id: 1150, kategori: 'SOĞUK SANDVİÇ', altKategori: 'BÜYÜK Sandviç', ad: '74- KARIŞIK KESİK ZEYTİN BS', fiyat: 18, durum: 'AKTIF', menuSirasi: 10, sabit: false, azPorsiyon: false, azFiyat: null, parentId: null, isAzVariant: false },
  { id: 1151, kategori: 'SOĞUK SANDVİÇ', altKategori: 'BÜYÜK Sandviç', ad: '25-Dana Jambon B.(1.5 Dlm)', fiyat: 50, durum: 'AKTIF', menuSirasi: 11, sabit: false, azPorsiyon: false, azFiyat: null, parentId: null, isAzVariant: false },
  { id: 1152, kategori: 'SOĞUK SANDVİÇ', altKategori: 'BÜYÜK Sandviç', ad: '26- Tavuk Jambon B.(1.5 Dlm)', fiyat: 23, durum: 'AKTIF', menuSirasi: 12, sabit: false, azPorsiyon: false, azFiyat: null, parentId: null, isAzVariant: false },
  { id: 1153, kategori: 'SOĞUK SANDVİÇ', altKategori: 'BÜYÜK Sandviç', ad: '30-Patates Kızartması B.', fiyat: 23, durum: 'AKTIF', menuSirasi: 13, sabit: false, azPorsiyon: false, azFiyat: null, parentId: null, isAzVariant: false },
  { id: 1154, kategori: 'SOĞUK SANDVİÇ', altKategori: 'BÜYÜK Sandviç', ad: '23-Salam B(2 Dlm)', fiyat: 23, durum: 'AKTIF', menuSirasi: 14, sabit: false, azPorsiyon: false, azFiyat: null, parentId: null, isAzVariant: false },
  { id: 1155, kategori: 'SOĞUK SANDVİÇ', altKategori: 'BÜYÜK Sandviç', ad: '27-Sosis B.(3 Ad.)', fiyat: 23, durum: 'AKTIF', menuSirasi: 15, sabit: false, azPorsiyon: false, azFiyat: null, parentId: null, isAzVariant: false },
  { id: 1156, kategori: 'SOĞUK SANDVİÇ', altKategori: 'BÜYÜK Sandviç', ad: '28-Sosis Patates B.(2 Kşk)', fiyat: 23, durum: 'AKTIF', menuSirasi: 16, sabit: false, azPorsiyon: false, azFiyat: null, parentId: null, isAzVariant: false },
  { id: 1157, kategori: 'SOĞUK SANDVİÇ', altKategori: 'BÜYÜK Sandviç', ad: '57-ACILI EZME BS', fiyat: 17, durum: 'AKTIF', menuSirasi: 17, sabit: false, azPorsiyon: false, azFiyat: null, parentId: null, isAzVariant: false },
  { id: 1158, kategori: 'SOĞUK SANDVİÇ', altKategori: 'BÜYÜK Sandviç', ad: '58- Amerikan B.', fiyat: 25, durum: 'AKTIF', menuSirasi: 18, sabit: false, azPorsiyon: false, azFiyat: null, parentId: null, isAzVariant: false },
  { id: 1159, kategori: 'SOĞUK SANDVİÇ', altKategori: 'BÜYÜK Sandviç', ad: '60-Krem Peynir B.', fiyat: 36, durum: 'AKTIF', menuSirasi: 19, sabit: false, azPorsiyon: false, azFiyat: null, parentId: null, isAzVariant: false },
  { id: 1160, kategori: 'SOĞUK SANDVİÇ', altKategori: 'BÜYÜK Sandviç', ad: '63-Zeytin Ezmesi B.', fiyat: 17, durum: 'AKTIF', menuSirasi: 20, sabit: false, azPorsiyon: false, azFiyat: null, parentId: null, isAzVariant: false },
  { id: 1161, kategori: 'SOĞUK SANDVİÇ', altKategori: 'BÜYÜK Sandviç', ad: '52-Biber B.', fiyat: 6, durum: 'AKTIF', menuSirasi: 21, sabit: false, azPorsiyon: false, azFiyat: null, parentId: null, isAzVariant: false },
  { id: 1162, kategori: 'SOĞUK SANDVİÇ', altKategori: 'BÜYÜK Sandviç', ad: '53-Kıvırcık B.', fiyat: 6, durum: 'AKTIF', menuSirasi: 22, sabit: false, azPorsiyon: false, azFiyat: null, parentId: null, isAzVariant: false },
  { id: 1163, kategori: 'SOĞUK SANDVİÇ', altKategori: 'BÜYÜK Sandviç', ad: '54-Maydanoz BS', fiyat: 10, durum: 'AKTIF', menuSirasi: 23, sabit: false, azPorsiyon: false, azFiyat: null, parentId: null, isAzVariant: false },
  { id: 1164, kategori: 'SOĞUK SANDVİÇ', altKategori: 'BÜYÜK Sandviç', ad: '55- Roka B', fiyat: 6, durum: 'AKTIF', menuSirasi: 24, sabit: false, azPorsiyon: false, azFiyat: null, parentId: null, isAzVariant: false },
  { id: 1165, kategori: 'SOĞUK SANDVİÇ', altKategori: 'BÜYÜK Sandviç', ad: '29-Kavurma B.(3 Dlm)', fiyat: 132, durum: 'AKTIF', menuSirasi: 25, sabit: false, azPorsiyon: false, azFiyat: null, parentId: null, isAzVariant: false },
  { id: 1166, kategori: 'SOĞUK SANDVİÇ', altKategori: 'BÜYÜK Sandviç', ad: '26-Dilim Turşu B.', fiyat: 4, durum: 'AKTIF', menuSirasi: 26, sabit: false, azPorsiyon: false, azFiyat: null, parentId: null, isAzVariant: false },
  { id: 1167, kategori: 'SOĞUK SANDVİÇ', altKategori: 'BÜYÜK Sandviç', ad: '27- Bal B.', fiyat: 38, durum: 'AKTIF', menuSirasi: 27, sabit: false, azPorsiyon: false, azFiyat: null, parentId: null, isAzVariant: false },
  { id: 1168, kategori: 'SOĞUK SANDVİÇ', altKategori: 'BÜYÜK Sandviç', ad: '51-Kaymak B.', fiyat: 54, durum: 'AKTIF', menuSirasi: 28, sabit: false, azPorsiyon: false, azFiyat: null, parentId: null, isAzVariant: false },
  { id: 1169, kategori: 'SOĞUK SANDVİÇ', altKategori: 'BÜYÜK Sandviç', ad: '72- ÇEKİRDEKLİ Siyah Zeytin B.', fiyat: 18, durum: 'AKTIF', menuSirasi: 29, sabit: false, azPorsiyon: false, azFiyat: null, parentId: null, isAzVariant: false },
  { id: 1170, kategori: 'SOĞUK SANDVİÇ', altKategori: 'BÜYÜK Sandviç', ad: '73- Kesik Siyah Zeytin BS', fiyat: 18, durum: 'AKTIF', menuSirasi: 30, sabit: false, azPorsiyon: false, azFiyat: null, parentId: null, isAzVariant: false },
  { id: 1171, kategori: 'SOĞUK SANDVİÇ', altKategori: 'BÜYÜK Sandviç', ad: '70- ÇEKİRDEKLİ Yeşil Zeytin BS', fiyat: 18, durum: 'AKTIF', menuSirasi: 31, sabit: false, azPorsiyon: false, azFiyat: null, parentId: null, isAzVariant: false },
  { id: 1172, kategori: 'SOĞUK SANDVİÇ', altKategori: 'BÜYÜK Sandviç', ad: '71-Kesik Yeşil Zeytin BS', fiyat: 18, durum: 'AKTIF', menuSirasi: 32, sabit: false, azPorsiyon: false, azFiyat: null, parentId: null, isAzVariant: false },
  { id: 1173, kategori: 'SOĞUK SANDVİÇ', altKategori: 'BÜYÜK Sandviç', ad: '27-Çokokrem B.', fiyat: 36, durum: 'AKTIF', menuSirasi: 33, sabit: false, azPorsiyon: false, azFiyat: null, parentId: null, isAzVariant: false },
  { id: 1174, kategori: 'SOĞUK SANDVİÇ', altKategori: 'BÜYÜK Sandviç', ad: 'Kırmızı Lahana BS', fiyat: 7, durum: 'AKTIF', menuSirasi: 34, sabit: false, azPorsiyon: false, azFiyat: null, parentId: null, isAzVariant: false },
  { id: 1175, kategori: 'SOĞUK SANDVİÇ', altKategori: 'BÜYÜK Sandviç', ad: '22- B. Beyaz Peynirli Menü Büyük', fiyat: 100, durum: 'AKTIF', menuSirasi: 35, sabit: false, azPorsiyon: false, azFiyat: null, parentId: null, isAzVariant: false },
  { id: 1176, kategori: 'SOĞUK SANDVİÇ', altKategori: 'BÜYÜK Sandviç', ad: 'B. Helva 2 Dlm', fiyat: 23, durum: 'AKTIF', menuSirasi: 35, sabit: false, azPorsiyon: false, azFiyat: null, parentId: null, isAzVariant: false },
  { id: 1177, kategori: 'SOĞUK SANDVİÇ', altKategori: 'Küçük Sandviç', ad: '01-KÜÇÜK BEYAZ Ekmek', fiyat: 43, durum: 'AKTIF', menuSirasi: 1, sabit: false, azPorsiyon: false, azFiyat: null, parentId: null, isAzVariant: false },
  { id: 1178, kategori: 'SOĞUK SANDVİÇ', altKategori: 'Küçük Sandviç', ad: '02-KÜÇÜK KEPEK Ekmek', fiyat: 43, durum: 'AKTIF', menuSirasi: 2, sabit: false, azPorsiyon: false, azFiyat: null, parentId: null, isAzVariant: false },
  { id: 1179, kategori: 'SOĞUK SANDVİÇ', altKategori: 'Küçük Sandviç', ad: '08- Domates KS', fiyat: 6, durum: 'AKTIF', menuSirasi: 3, sabit: false, azPorsiyon: false, azFiyat: null, parentId: null, isAzVariant: false },
  { id: 1180, kategori: 'SOĞUK SANDVİÇ', altKategori: 'Küçük Sandviç', ad: '09-Dilim Salatalık K.', fiyat: 6, durum: 'AKTIF', menuSirasi: 4, sabit: false, azPorsiyon: false, azFiyat: null, parentId: null, isAzVariant: false },
  { id: 1181, kategori: 'SOĞUK SANDVİÇ', altKategori: 'Küçük Sandviç', ad: '10- Beyaz Peynir K.(2 DLM)', fiyat: 40, durum: 'AKTIF', menuSirasi: 5, sabit: false, azPorsiyon: false, azFiyat: null, parentId: null, isAzVariant: false },
  { id: 1182, kategori: 'SOĞUK SANDVİÇ', altKategori: 'Küçük Sandviç', ad: '11-Kaşar K.(3DLM)', fiyat: 18, durum: 'AKTIF', menuSirasi: 6, sabit: false, azPorsiyon: false, azFiyat: null, parentId: null, isAzVariant: false },
  { id: 1183, kategori: 'SOĞUK SANDVİÇ', altKategori: 'Küçük Sandviç', ad: '12-Eski Kasar K.(1 Dlm.)', fiyat: 23, durum: 'AKTIF', menuSirasi: 7, sabit: false, azPorsiyon: false, azFiyat: null, parentId: null, isAzVariant: false },
  { id: 1184, kategori: 'SOĞUK SANDVİÇ', altKategori: 'Küçük Sandviç', ad: '13-Çedar (2DLM) KS', fiyat: 22, durum: 'AKTIF', menuSirasi: 8, sabit: false, azPorsiyon: false, azFiyat: null, parentId: null, isAzVariant: false },
  { id: 1185, kategori: 'SOĞUK SANDVİÇ', altKategori: 'Küçük Sandviç', ad: '14- Yumurta K(1 ADT)', fiyat: 18, durum: 'AKTIF', menuSirasi: 9, sabit: false, azPorsiyon: false, azFiyat: null, parentId: null, isAzVariant: false },
  { id: 1186, kategori: 'SOĞUK SANDVİÇ', altKategori: 'Küçük Sandviç', ad: '74- KARIŞIK KESİK ZEYTİN K.', fiyat: 17, durum: 'AKTIF', menuSirasi: 10, sabit: false, azPorsiyon: false, azFiyat: null, parentId: null, isAzVariant: false },
  { id: 1187, kategori: 'SOĞUK SANDVİÇ', altKategori: 'Küçük Sandviç', ad: '25-Dana Jamb K. (1 Dlm.)', fiyat: 34, durum: 'AKTIF', menuSirasi: 11, sabit: false, azPorsiyon: false, azFiyat: null, parentId: null, isAzVariant: false },
  { id: 1188, kategori: 'SOĞUK SANDVİÇ', altKategori: 'Küçük Sandviç', ad: '26- Tavuk Jambon K.(1 DLM)', fiyat: 18, durum: 'AKTIF', menuSirasi: 12, sabit: false, azPorsiyon: false, azFiyat: null, parentId: null, isAzVariant: false },
  { id: 1189, kategori: 'SOĞUK SANDVİÇ', altKategori: 'Küçük Sandviç', ad: '30-Patates Kızartma KS', fiyat: 18, durum: 'AKTIF', menuSirasi: 13, sabit: false, azPorsiyon: false, azFiyat: null, parentId: null, isAzVariant: false },
  { id: 1190, kategori: 'SOĞUK SANDVİÇ', altKategori: 'Küçük Sandviç', ad: '23-Salam KS', fiyat: 18, durum: 'AKTIF', menuSirasi: 14, sabit: false, azPorsiyon: false, azFiyat: null, parentId: null, isAzVariant: false },
  { id: 1191, kategori: 'SOĞUK SANDVİÇ', altKategori: 'Küçük Sandviç', ad: '27-Sosis (2 AD) KS', fiyat: 18, durum: 'AKTIF', menuSirasi: 15, sabit: false, azPorsiyon: false, azFiyat: null, parentId: null, isAzVariant: false },
  { id: 1192, kategori: 'SOĞUK SANDVİÇ', altKategori: 'Küçük Sandviç', ad: '28-Sosis Pat.(1 Kşk) KS', fiyat: 18, durum: 'AKTIF', menuSirasi: 16, sabit: false, azPorsiyon: false, azFiyat: null, parentId: null, isAzVariant: false },
  { id: 1193, kategori: 'SOĞUK SANDVİÇ', altKategori: 'Küçük Sandviç', ad: '57- Acılı Ezme k.', fiyat: 16, durum: 'AKTIF', menuSirasi: 17, sabit: false, azPorsiyon: false, azFiyat: null, parentId: null, isAzVariant: false },
  { id: 1194, kategori: 'SOĞUK SANDVİÇ', altKategori: 'Küçük Sandviç', ad: '58- Amerikan KS', fiyat: 17, durum: 'AKTIF', menuSirasi: 18, sabit: false, azPorsiyon: false, azFiyat: null, parentId: null, isAzVariant: false },
  { id: 1195, kategori: 'SOĞUK SANDVİÇ', altKategori: 'Küçük Sandviç', ad: '60-Krem Peynir k.', fiyat: 19, durum: 'AKTIF', menuSirasi: 20, sabit: false, azPorsiyon: false, azFiyat: null, parentId: null, isAzVariant: false },
  { id: 1196, kategori: 'SOĞUK SANDVİÇ', altKategori: 'Küçük Sandviç', ad: '63-Zeytin Ezmesi k.', fiyat: 16, durum: 'AKTIF', menuSirasi: 20, sabit: false, azPorsiyon: false, azFiyat: null, parentId: null, isAzVariant: false },
  { id: 1197, kategori: 'SOĞUK SANDVİÇ', altKategori: 'Küçük Sandviç', ad: '52-Biber KS', fiyat: 6, durum: 'AKTIF', menuSirasi: 21, sabit: false, azPorsiyon: false, azFiyat: null, parentId: null, isAzVariant: false },
  { id: 1198, kategori: 'SOĞUK SANDVİÇ', altKategori: 'Küçük Sandviç', ad: '53- KIVIRCIK KS', fiyat: 6, durum: 'AKTIF', menuSirasi: 22, sabit: false, azPorsiyon: false, azFiyat: null, parentId: null, isAzVariant: false },
  { id: 1199, kategori: 'SOĞUK SANDVİÇ', altKategori: 'Küçük Sandviç', ad: '54-Maydanoz KS', fiyat: 9, durum: 'AKTIF', menuSirasi: 23, sabit: false, azPorsiyon: false, azFiyat: null, parentId: null, isAzVariant: false },
  { id: 1200, kategori: 'SOĞUK SANDVİÇ', altKategori: 'Küçük Sandviç', ad: '55-Roka K.', fiyat: 6, durum: 'AKTIF', menuSirasi: 24, sabit: false, azPorsiyon: false, azFiyat: null, parentId: null, isAzVariant: false },
  { id: 1201, kategori: 'SOĞUK SANDVİÇ', altKategori: 'Küçük Sandviç', ad: '29-Kavurma K.(2 DLM) KS', fiyat: 88, durum: 'AKTIF', menuSirasi: 25, sabit: false, azPorsiyon: false, azFiyat: null, parentId: null, isAzVariant: false },
  { id: 1202, kategori: 'SOĞUK SANDVİÇ', altKategori: 'Küçük Sandviç', ad: '26-Turşu Dilim KS', fiyat: 5, durum: 'AKTIF', menuSirasi: 26, sabit: false, azPorsiyon: false, azFiyat: null, parentId: null, isAzVariant: false },
  { id: 1203, kategori: 'SOĞUK SANDVİÇ', altKategori: 'Küçük Sandviç', ad: '27- BAL KS', fiyat: 18, durum: 'AKTIF', menuSirasi: 27, sabit: false, azPorsiyon: false, azFiyat: null, parentId: null, isAzVariant: false },
  { id: 1204, kategori: 'SOĞUK SANDVİÇ', altKategori: 'Küçük Sandviç', ad: '28- Kaymak k.', fiyat: 36, durum: 'AKTIF', menuSirasi: 28, sabit: false, azPorsiyon: false, azFiyat: null, parentId: null, isAzVariant: false },
  { id: 1205, kategori: 'SOĞUK SANDVİÇ', altKategori: 'Küçük Sandviç', ad: '72- ÇEKİRDEKLİ Siyah Zeytin KS', fiyat: 17, durum: 'AKTIF', menuSirasi: 29, sabit: false, azPorsiyon: false, azFiyat: null, parentId: null, isAzVariant: false },
  { id: 1206, kategori: 'SOĞUK SANDVİÇ', altKategori: 'Küçük Sandviç', ad: '73- Kesik Siyah Zeytin KS', fiyat: 17, durum: 'AKTIF', menuSirasi: 30, sabit: false, azPorsiyon: false, azFiyat: null, parentId: null, isAzVariant: false },
  { id: 1207, kategori: 'SOĞUK SANDVİÇ', altKategori: 'Küçük Sandviç', ad: '70- ÇEKİRDEKLİ Yeşil Zeytin KS', fiyat: 17, durum: 'AKTIF', menuSirasi: 31, sabit: false, azPorsiyon: false, azFiyat: null, parentId: null, isAzVariant: false },
  { id: 1208, kategori: 'SOĞUK SANDVİÇ', altKategori: 'Küçük Sandviç', ad: '71-Kesik Yeşil Zeytin KS', fiyat: 17, durum: 'AKTIF', menuSirasi: 32, sabit: false, azPorsiyon: false, azFiyat: null, parentId: null, isAzVariant: false },
  { id: 1209, kategori: 'SOĞUK SANDVİÇ', altKategori: 'Küçük Sandviç', ad: '34- Çokokrem k', fiyat: 23, durum: 'AKTIF', menuSirasi: 33, sabit: false, azPorsiyon: false, azFiyat: null, parentId: null, isAzVariant: false },
  { id: 1210, kategori: 'SOĞUK SANDVİÇ', altKategori: 'Küçük Sandviç', ad: 'Kırmızı Lahana KS', fiyat: 6, durum: 'AKTIF', menuSirasi: 34, sabit: false, azPorsiyon: false, azFiyat: null, parentId: null, isAzVariant: false },
  { id: 1211, kategori: 'SOĞUK SANDVİÇ', altKategori: 'Küçük Sandviç', ad: '22- K. Beyaz Peynirli Menü KS', fiyat: 85, durum: 'AKTIF', menuSirasi: 35, sabit: false, azPorsiyon: false, azFiyat: null, parentId: null, isAzVariant: false },
  { id: 1212, kategori: 'SOĞUK SANDVİÇ', altKategori: 'Küçük Sandviç', ad: 'K. Helva 2 Dlm.', fiyat: 23, durum: 'AKTIF', menuSirasi: 99, sabit: false, azPorsiyon: false, azFiyat: null, parentId: null, isAzVariant: false },
  { id: 1213, kategori: 'SOĞUK SANDVİÇ', altKategori: 'Menü Sandviç ( BÜYÜK )', ad: 'Büyük Karışık Sandviç', fiyat: 205, durum: 'AKTIF', menuSirasi: 1, sabit: false, azPorsiyon: false, azFiyat: null, parentId: null, isAzVariant: false },
  { id: 1214, kategori: 'SOĞUK SANDVİÇ', altKategori: 'Menü Sandviç ( BÜYÜK )', ad: 'TAVUKLU YARIM', fiyat: 135, durum: 'AKTIF', menuSirasi: 3, sabit: false, azPorsiyon: false, azFiyat: null, parentId: null, isAzVariant: false },
  { id: 1215, kategori: 'SOĞUK SANDVİÇ', altKategori: 'Menü Sandviç ( BÜYÜK )', ad: 'TON BALIKLI SANDVİÇ büyük', fiyat: 155, durum: 'AKTIF', menuSirasi: 5, sabit: false, azPorsiyon: false, azFiyat: null, parentId: null, isAzVariant: false },
  { id: 1216, kategori: 'SOĞUK SANDVİÇ', altKategori: 'Menü Sandviç ( Küçük )', ad: 'K.Sandviç TON BALIKLI', fiyat: 130, durum: 'AKTIF', menuSirasi: 1, sabit: false, azPorsiyon: false, azFiyat: null, parentId: null, isAzVariant: false },
  { id: 1217, kategori: 'SOĞUK SANDVİÇ', altKategori: 'Menü Sandviç ( Küçük )', ad: 'K. Sandviç Tavuklu', fiyat: 105, durum: 'AKTIF', menuSirasi: 2, sabit: false, azPorsiyon: false, azFiyat: null, parentId: null, isAzVariant: false },
  { id: 1218, kategori: 'SOĞUK SANDVİÇ', altKategori: 'Menü Sandviç ( Küçük )', ad: 'K. Sandviç Karışık', fiyat: 170, durum: 'AKTIF', menuSirasi: 2, sabit: false, azPorsiyon: false, azFiyat: null, parentId: null, isAzVariant: false },
  { id: 1219, kategori: 'TATLI SANDVİÇ', altKategori: 'BÜYÜK Tatlı Sandviç', ad: 'Büyük Bal Sandviç', fiyat: 90, durum: 'AKTIF', menuSirasi: 1, sabit: false, azPorsiyon: false, azFiyat: null, parentId: null, isAzVariant: false },
  { id: 1220, kategori: 'TATLI SANDVİÇ', altKategori: 'BÜYÜK Tatlı Sandviç', ad: 'Büyük Bal-Kaymak', fiyat: 155, durum: 'AKTIF', menuSirasi: 2, sabit: false, azPorsiyon: false, azFiyat: null, parentId: null, isAzVariant: false },
  { id: 1221, kategori: 'TATLI SANDVİÇ', altKategori: 'BÜYÜK Tatlı Sandviç', ad: 'Büyük Bal-Çikolata', fiyat: 155, durum: 'AKTIF', menuSirasi: 3, sabit: false, azPorsiyon: false, azFiyat: null, parentId: null, isAzVariant: false },
  { id: 1222, kategori: 'TATLI SANDVİÇ', altKategori: 'BÜYÜK Tatlı Sandviç', ad: 'Büyük Bal-Kaymak-Çikolata', fiyat: 170, durum: 'AKTIF', menuSirasi: 4, sabit: false, azPorsiyon: false, azFiyat: null, parentId: null, isAzVariant: false },
  { id: 1223, kategori: 'TATLI SANDVİÇ', altKategori: 'BÜYÜK Tatlı Sandviç', ad: 'Büyük Kaymak-Çikolata', fiyat: 155, durum: 'AKTIF', menuSirasi: 5, sabit: false, azPorsiyon: false, azFiyat: null, parentId: null, isAzVariant: false },
  { id: 1224, kategori: 'TATLI SANDVİÇ', altKategori: 'Küçük Tatlı Sandviç', ad: 'Küçük Bal-Kaymak', fiyat: 125, durum: 'AKTIF', menuSirasi: 2, sabit: false, azPorsiyon: false, azFiyat: null, parentId: null, isAzVariant: false },
  { id: 1225, kategori: 'TATLI SANDVİÇ', altKategori: 'Küçük Tatlı Sandviç', ad: 'Küçük Kaymak-Çikolata', fiyat: 125, durum: 'AKTIF', menuSirasi: 3, sabit: false, azPorsiyon: false, azFiyat: null, parentId: null, isAzVariant: false },
  { id: 1226, kategori: 'TATLI SANDVİÇ', altKategori: 'Küçük Tatlı Sandviç', ad: 'Küçük Bal-Kaymak-Çikolata', fiyat: 150, durum: 'AKTIF', menuSirasi: 4, sabit: false, azPorsiyon: false, azFiyat: null, parentId: null, isAzVariant: false },
  { id: 1227, kategori: 'TATLI SANDVİÇ', altKategori: 'Küçük Tatlı Sandviç', ad: 'Küçük Bal Sandviç', fiyat: 80, durum: 'AKTIF', menuSirasi: 1, sabit: false, azPorsiyon: false, azFiyat: null, parentId: null, isAzVariant: false },
  { id: 1228, kategori: 'TATLI SANDVİÇ', altKategori: 'Küçük Tatlı Sandviç', ad: 'Küçük Bal-Çikolata', fiyat: 125, durum: 'AKTIF', menuSirasi: 3, sabit: false, azPorsiyon: false, azFiyat: null, parentId: null, isAzVariant: false },
  { id: 1229, kategori: 'YEMEKLER', altKategori: 'Ana Yemekler', ad: 'MEVSİM SALATA', fiyat: 75, durum: 'AKTIF', menuSirasi: 1, sabit: false, azPorsiyon: true, azFiyat: 55, parentId: null, isAzVariant: false },
  { id: 1230, kategori: 'YEMEKLER', altKategori: 'Ana Yemekler', ad: 'PİRİNÇ PİLAVI', fiyat: 85, durum: 'AKTIF', menuSirasi: 3, sabit: false, azPorsiyon: true, azFiyat: 60, parentId: null, isAzVariant: false },
  { id: 1231, kategori: 'YEMEKLER', altKategori: 'Ana Yemekler', ad: 'MEZE', fiyat: 85, durum: 'AKTIF', menuSirasi: 5, sabit: false, azPorsiyon: true, azFiyat: 60, parentId: null, isAzVariant: false },
  { id: 1232, kategori: 'YEMEKLER', altKategori: 'Ana Yemekler', ad: 'KURU FASÜLYE', fiyat: 130, durum: 'AKTIF', menuSirasi: 7, sabit: false, azPorsiyon: true, azFiyat: 85, parentId: null, isAzVariant: false },
  { id: 1233, kategori: 'YEMEKLER', altKategori: 'Ana Yemekler', ad: 'NOHUT', fiyat: 130, durum: 'PASIF', menuSirasi: 7, sabit: false, azPorsiyon: true, azFiyat: 85, parentId: null, isAzVariant: false },
  { id: 1234, kategori: 'YEMEKLER', altKategori: 'Ana Yemekler', ad: 'ARNAVUT CİĞERİ', fiyat: 295, durum: 'PASIF', menuSirasi: 50, sabit: false, azPorsiyon: true, azFiyat: 190, parentId: null, isAzVariant: false },
  { id: 1235, kategori: 'YEMEKLER', altKategori: 'Ana Yemekler', ad: 'ÇOBAN KAVURMA', fiyat: 295, durum: 'PASIF', menuSirasi: 50, sabit: false, azPorsiyon: true, azFiyat: 190, parentId: null, isAzVariant: false },
  { id: 1236, kategori: 'YEMEKLER', altKategori: 'Ana Yemekler', ad: 'MANTI', fiyat: 295, durum: 'AKTIF', menuSirasi: 50, sabit: false, azPorsiyon: true, azFiyat: 190, parentId: null, isAzVariant: false },
  { id: 1237, kategori: 'YEMEKLER', altKategori: 'Ana Yemekler', ad: 'SEBZELİ KAVURMA', fiyat: 295, durum: 'PASIF', menuSirasi: 50, sabit: false, azPorsiyon: true, azFiyat: 190, parentId: null, isAzVariant: false },
  { id: 1238, kategori: 'YEMEKLER', altKategori: 'Ana Yemekler', ad: 'KIYMALI MAKARNA', fiyat: 130, durum: 'PASIF', menuSirasi: 50, sabit: false, azPorsiyon: true, azFiyat: 85, parentId: null, isAzVariant: false },
  { id: 1239, kategori: 'YEMEKLER', altKategori: 'Ana Yemekler', ad: 'PATLICAN KEBABI', fiyat: 295, durum: 'PASIF', menuSirasi: 50, sabit: false, azPorsiyon: true, azFiyat: 190, parentId: null, isAzVariant: false },
  { id: 1240, kategori: 'YEMEKLER', altKategori: 'Ana Yemekler', ad: 'BAMYA', fiyat: 165, durum: 'PASIF', menuSirasi: 50, sabit: false, azPorsiyon: true, azFiyat: 110, parentId: null, isAzVariant: false },
  { id: 1241, kategori: 'YEMEKLER', altKategori: 'Ana Yemekler', ad: 'KAPUSKA', fiyat: 130, durum: 'PASIF', menuSirasi: 50, sabit: false, azPorsiyon: true, azFiyat: 85, parentId: null, isAzVariant: false },
  { id: 1242, kategori: 'YEMEKLER', altKategori: 'Ana Yemekler', ad: 'MANTARLI TAVUK', fiyat: 165, durum: 'PASIF', menuSirasi: 50, sabit: false, azPorsiyon: true, azFiyat: 110, parentId: null, isAzVariant: false },
  { id: 1243, kategori: 'YEMEKLER', altKategori: 'Ana Yemekler', ad: 'MİSKET KÖFTE', fiyat: 205, durum: 'PASIF', menuSirasi: 50, sabit: false, azPorsiyon: true, azFiyat: 135, parentId: null, isAzVariant: false },
  { id: 1244, kategori: 'YEMEKLER', altKategori: 'Ana Yemekler', ad: 'SOYA SOSLU TAVUK', fiyat: 165, durum: 'PASIF', menuSirasi: 50, sabit: false, azPorsiyon: true, azFiyat: 110, parentId: null, isAzVariant: false },
  { id: 1245, kategori: 'YEMEKLER', altKategori: 'Ana Yemekler', ad: 'TAVUK SOTE', fiyat: 165, durum: 'PASIF', menuSirasi: 50, sabit: false, azPorsiyon: true, azFiyat: 110, parentId: null, isAzVariant: false },
  { id: 1246, kategori: 'YEMEKLER', altKategori: 'Ana Yemekler', ad: 'BAHÇIVAN KEBABI', fiyat: 295, durum: 'PASIF', menuSirasi: 50, sabit: false, azPorsiyon: true, azFiyat: 190, parentId: null, isAzVariant: false },
  { id: 1247, kategori: 'YEMEKLER', altKategori: 'Ana Yemekler', ad: 'BEZELYELİ TAVUK', fiyat: 165, durum: 'PASIF', menuSirasi: 50, sabit: false, azPorsiyon: true, azFiyat: 110, parentId: null, isAzVariant: false },
  { id: 1248, kategori: 'YEMEKLER', altKategori: 'Ana Yemekler', ad: 'ÇITIR TAVUK', fiyat: 165, durum: 'PASIF', menuSirasi: 50, sabit: false, azPorsiyon: true, azFiyat: 110, parentId: null, isAzVariant: false },
  { id: 1249, kategori: 'YEMEKLER', altKategori: 'Ana Yemekler', ad: 'ÇİFTLİK KEBABI', fiyat: 295, durum: 'PASIF', menuSirasi: 50, sabit: false, azPorsiyon: true, azFiyat: 190, parentId: null, isAzVariant: false },
  { id: 1250, kategori: 'YEMEKLER', altKategori: 'Ana Yemekler', ad: 'EKŞİLİ KÖFTE', fiyat: 205, durum: 'PASIF', menuSirasi: 50, sabit: false, azPorsiyon: true, azFiyat: 135, parentId: null, isAzVariant: false },
  { id: 1251, kategori: 'YEMEKLER', altKategori: 'Ana Yemekler', ad: 'Hamsi Buğulama', fiyat: 310, durum: 'PASIF', menuSirasi: 50, sabit: false, azPorsiyon: false, azFiyat: null, parentId: null, isAzVariant: false },
  { id: 1252, kategori: 'YEMEKLER', altKategori: 'Ana Yemekler', ad: 'Hamsi Tava', fiyat: 310, durum: 'PASIF', menuSirasi: 50, sabit: false, azPorsiyon: false, azFiyat: null, parentId: null, isAzVariant: false },
  { id: 1253, kategori: 'YEMEKLER', altKategori: 'Ana Yemekler', ad: 'KARNABAHAR YEMEĞİ', fiyat: 130, durum: 'PASIF', menuSirasi: 50, sabit: false, azPorsiyon: true, azFiyat: 85, parentId: null, isAzVariant: false },
  { id: 1254, kategori: 'YEMEKLER', altKategori: 'Ana Yemekler', ad: 'KEŞKEK', fiyat: 165, durum: 'PASIF', menuSirasi: 50, sabit: false, azPorsiyon: true, azFiyat: 110, parentId: null, isAzVariant: false },
  { id: 1255, kategori: 'YEMEKLER', altKategori: 'Ana Yemekler', ad: 'KÖRİ SOSLU TAVUK', fiyat: 165, durum: 'PASIF', menuSirasi: 50, sabit: false, azPorsiyon: true, azFiyat: 110, parentId: null, isAzVariant: false },
  { id: 1256, kategori: 'YEMEKLER', altKategori: 'Ana Yemekler', ad: 'ORMAN KEBABI', fiyat: 295, durum: 'PASIF', menuSirasi: 50, sabit: false, azPorsiyon: true, azFiyat: 190, parentId: null, isAzVariant: false },
  { id: 1257, kategori: 'YEMEKLER', altKategori: 'Ana Yemekler', ad: 'PATATES MUSAKKA', fiyat: 165, durum: 'PASIF', menuSirasi: 50, sabit: false, azPorsiyon: true, azFiyat: 110, parentId: null, isAzVariant: false },
  { id: 1258, kategori: 'YEMEKLER', altKategori: 'Ana Yemekler', ad: 'PATLICAN MUSAKKA', fiyat: 165, durum: 'PASIF', menuSirasi: 50, sabit: false, azPorsiyon: true, azFiyat: 110, parentId: null, isAzVariant: false },
  { id: 1259, kategori: 'YEMEKLER', altKategori: 'Ana Yemekler', ad: 'PÜRELİ TAS KEBABI', fiyat: 295, durum: 'PASIF', menuSirasi: 50, sabit: false, azPorsiyon: true, azFiyat: 190, parentId: null, isAzVariant: false },
  { id: 1260, kategori: 'YEMEKLER', altKategori: 'Ana Yemekler', ad: 'SEBZELİ ET SOTE', fiyat: 295, durum: 'PASIF', menuSirasi: 50, sabit: false, azPorsiyon: true, azFiyat: 190, parentId: null, isAzVariant: false },
  { id: 1261, kategori: 'YEMEKLER', altKategori: 'Ana Yemekler', ad: 'SEBZELİ KÖFTE', fiyat: 205, durum: 'PASIF', menuSirasi: 50, sabit: false, azPorsiyon: true, azFiyat: 135, parentId: null, isAzVariant: false },
  { id: 1262, kategori: 'YEMEKLER', altKategori: 'Ana Yemekler', ad: 'KIYMALI ARAP TAVA', fiyat: 165, durum: 'PASIF', menuSirasi: 50, sabit: false, azPorsiyon: true, azFiyat: 110, parentId: null, isAzVariant: false },
  { id: 1263, kategori: 'YEMEKLER', altKategori: 'Ana Yemekler', ad: 'SOYA SOSLU TAVUK', fiyat: 165, durum: 'PASIF', menuSirasi: 50, sabit: false, azPorsiyon: true, azFiyat: 110, parentId: null, isAzVariant: false },
  { id: 1264, kategori: 'YEMEKLER', altKategori: 'Ana Yemekler', ad: 'TAS KEBABI', fiyat: 295, durum: 'AKTIF', menuSirasi: 50, sabit: false, azPorsiyon: true, azFiyat: 190, parentId: null, isAzVariant: false },
  { id: 1265, kategori: 'YEMEKLER', altKategori: 'Ana Yemekler', ad: 'TAZE FASÜLYE', fiyat: 130, durum: 'PASIF', menuSirasi: 50, sabit: false, azPorsiyon: true, azFiyat: 85, parentId: null, isAzVariant: false },
  { id: 1266, kategori: 'YEMEKLER', altKategori: 'Ana Yemekler', ad: 'TÜRLÜ', fiyat: 130, durum: 'PASIF', menuSirasi: 50, sabit: false, azPorsiyon: true, azFiyat: 85, parentId: null, isAzVariant: false },
  { id: 1267, kategori: 'YEMEKLER', altKategori: 'Ana Yemekler', ad: 'YEŞİL MERCİMEK YEMEĞİ', fiyat: 130, durum: 'PASIF', menuSirasi: 50, sabit: false, azPorsiyon: true, azFiyat: 85, parentId: null, isAzVariant: false },
  { id: 1268, kategori: 'YEMEKLER', altKategori: 'Ana Yemekler', ad: 'İÇLİ KÖFTE ( ADET )', fiyat: 85, durum: 'PASIF', menuSirasi: 100, sabit: false, azPorsiyon: false, azFiyat: null, parentId: null, isAzVariant: false },
  { id: 1269, kategori: 'YEMEKLER', altKategori: 'Ana Yemekler', ad: 'KAŞARLI ISPANAK (ADET)', fiyat: 130, durum: 'PASIF', menuSirasi: 100, sabit: false, azPorsiyon: false, azFiyat: null, parentId: null, isAzVariant: false },
  { id: 1270, kategori: 'YEMEKLER', altKategori: 'Ana Yemekler', ad: 'KARNIYARIK (ADET)', fiyat: 175, durum: 'AKTIF', menuSirasi: 100, sabit: false, azPorsiyon: false, azFiyat: null, parentId: null, isAzVariant: false },
  { id: 1271, kategori: 'YEMEKLER', altKategori: 'Ana Yemekler', ad: 'Kıymalı Patates Dolma (ADET)', fiyat: 175, durum: 'PASIF', menuSirasi: 100, sabit: false, azPorsiyon: false, azFiyat: null, parentId: null, isAzVariant: false },
  { id: 1272, kategori: 'YEMEKLER', altKategori: 'Ana Yemekler', ad: 'Patates Mantısı (ADET)', fiyat: 75, durum: 'PASIF', menuSirasi: 100, sabit: false, azPorsiyon: false, azFiyat: null, parentId: null, isAzVariant: false },
  { id: 1273, kategori: 'YEMEKLER', altKategori: 'Ana Yemekler', ad: 'İslip Kebabı ( ADET )', fiyat: 295, durum: 'PASIF', menuSirasi: 100, sabit: false, azPorsiyon: false, azFiyat: null, parentId: null, isAzVariant: false },
  { id: 1274, kategori: 'YEMEKLER', altKategori: 'Ana Yemekler', ad: 'Kalçalı Piliç But (ADET)', fiyat: 165, durum: 'PASIF', menuSirasi: 100, sabit: false, azPorsiyon: false, azFiyat: null, parentId: null, isAzVariant: false },
  { id: 1275, kategori: 'YEMEKLER', altKategori: 'Ana Yemekler', ad: 'Kızartmış Tavuk Sarma (ADET)', fiyat: 165, durum: 'PASIF', menuSirasi: 100, sabit: false, azPorsiyon: false, azFiyat: null, parentId: null, isAzVariant: false },
  { id: 1276, kategori: 'YEMEKLER', altKategori: 'Ana Yemekler', ad: 'Piliç Topkapı (ADET)', fiyat: 165, durum: 'PASIF', menuSirasi: 100, sabit: false, azPorsiyon: false, azFiyat: null, parentId: null, isAzVariant: false },
  { id: 1277, kategori: 'YEMEKLER', altKategori: 'Ana Yemekler', ad: 'Tavuk Haşlama (ADET)', fiyat: 85, durum: 'AKTIF', menuSirasi: 100, sabit: false, azPorsiyon: false, azFiyat: null, parentId: null, isAzVariant: false },
  { id: 1278, kategori: 'YEMEKLER', altKategori: 'Ana Yemekler', ad: 'Acem Köfte ( 3 ADET )', fiyat: 205, durum: 'PASIF', menuSirasi: 100, sabit: false, azPorsiyon: true, azFiyat: 155, parentId: null, isAzVariant: false },
  { id: 1279, kategori: 'YEMEKLER', altKategori: 'Ana Yemekler', ad: 'Ankara Tava (ADET)', fiyat: 90, durum: 'PASIF', menuSirasi: 100, sabit: false, azPorsiyon: false, azFiyat: null, parentId: null, isAzVariant: false },
  { id: 1280, kategori: 'YEMEKLER', altKategori: 'Ana Yemekler', ad: 'Beğendi Köfte (ADET)', fiyat: 85, durum: 'PASIF', menuSirasi: 100, sabit: false, azPorsiyon: false, azFiyat: null, parentId: null, isAzVariant: false },
  { id: 1281, kategori: 'YEMEKLER', altKategori: 'Ana Yemekler', ad: 'Biber Dolması (ADET)', fiyat: 85, durum: 'PASIF', menuSirasi: 100, sabit: false, azPorsiyon: false, azFiyat: null, parentId: null, isAzVariant: false },
  { id: 1282, kategori: 'YEMEKLER', altKategori: 'Ana Yemekler', ad: 'Çanak Köfte (ADET)', fiyat: 175, durum: 'PASIF', menuSirasi: 100, sabit: false, azPorsiyon: false, azFiyat: null, parentId: null, isAzVariant: false },
  { id: 1283, kategori: 'YEMEKLER', altKategori: 'Ana Yemekler', ad: 'Dalyan Köfte (ADET)', fiyat: 175, durum: 'PASIF', menuSirasi: 100, sabit: false, azPorsiyon: false, azFiyat: null, parentId: null, isAzVariant: false },
  { id: 1284, kategori: 'YEMEKLER', altKategori: 'Ana Yemekler', ad: 'Dizme Köfte (ADET)', fiyat: 85, durum: 'AKTIF', menuSirasi: 100, sabit: false, azPorsiyon: false, azFiyat: null, parentId: null, isAzVariant: false },
  { id: 1285, kategori: 'YEMEKLER', altKategori: 'Ana Yemekler', ad: 'Etli Lahana Sarması (ADET)', fiyat: 80, durum: 'PASIF', menuSirasi: 100, sabit: false, azPorsiyon: false, azFiyat: null, parentId: null, isAzVariant: false },
  { id: 1286, kategori: 'YEMEKLER', altKategori: 'Ana Yemekler', ad: 'Fırın Baget Tavuk (ADET)', fiyat: 85, durum: 'PASIF', menuSirasi: 100, sabit: false, azPorsiyon: false, azFiyat: null, parentId: null, isAzVariant: false },
  { id: 1287, kategori: 'YEMEKLER', altKategori: 'Ana Yemekler', ad: 'Fırın Makarna (ADET)', fiyat: 130, durum: 'PASIF', menuSirasi: 100, sabit: false, azPorsiyon: false, azFiyat: null, parentId: null, isAzVariant: false },
  { id: 1288, kategori: 'YEMEKLER', altKategori: 'Ana Yemekler', ad: 'Hasan Paşa Köfte (ADET)', fiyat: 175, durum: 'PASIF', menuSirasi: 100, sabit: false, azPorsiyon: false, azFiyat: null, parentId: null, isAzVariant: false },
  { id: 1289, kategori: 'YEMEKLER', altKategori: 'Ana Yemekler', ad: 'İzmir Köfte (ADET)', fiyat: 85, durum: 'PASIF', menuSirasi: 100, sabit: false, azPorsiyon: false, azFiyat: null, parentId: null, isAzVariant: false },
  { id: 1290, kategori: 'YEMEKLER', altKategori: 'Ana Yemekler', ad: 'Kabak Sandal (ADET)', fiyat: 165, durum: 'PASIF', menuSirasi: 100, sabit: false, azPorsiyon: false, azFiyat: null, parentId: null, isAzVariant: false },
  { id: 1291, kategori: 'YEMEKLER', altKategori: 'Ana Yemekler', ad: 'Kağıt Kebabı (ADET)', fiyat: 295, durum: 'PASIF', menuSirasi: 100, sabit: false, azPorsiyon: false, azFiyat: null, parentId: null, isAzVariant: false },
  { id: 1292, kategori: 'YEMEKLER', altKategori: 'Ana Yemekler', ad: 'KANAT ( 6 ADET )', fiyat: 165, durum: 'PASIF', menuSirasi: 100, sabit: false, azPorsiyon: true, azFiyat: 110, parentId: null, isAzVariant: false },
  { id: 1293, kategori: 'YEMEKLER', altKategori: 'Ana Yemekler', ad: 'Kaşarlı Tavuk (ADET)', fiyat: 165, durum: 'AKTIF', menuSirasi: 100, sabit: false, azPorsiyon: false, azFiyat: null, parentId: null, isAzVariant: false },
  { id: 1294, kategori: 'YEMEKLER', altKategori: 'Ana Yemekler', ad: 'Krepli Tavuk (ADET)', fiyat: 165, durum: 'PASIF', menuSirasi: 100, sabit: false, azPorsiyon: false, azFiyat: null, parentId: null, isAzVariant: false },
  { id: 1295, kategori: 'YEMEKLER', altKategori: 'Ana Yemekler', ad: 'Sebze Graten (ADET)', fiyat: 130, durum: 'PASIF', menuSirasi: 100, sabit: false, azPorsiyon: false, azFiyat: null, parentId: null, isAzVariant: false },
  { id: 1296, kategori: 'YEMEKLER', altKategori: 'Ana Yemekler', ad: 'Sultan Kebabı (ADET)', fiyat: 165, durum: 'PASIF', menuSirasi: 100, sabit: false, azPorsiyon: false, azFiyat: null, parentId: null, isAzVariant: false },
  { id: 1297, kategori: 'YEMEKLER', altKategori: 'Ana Yemekler', ad: 'Susamlı Tavuk (.5.ADET.)', fiyat: 165, durum: 'PASIF', menuSirasi: 100, sabit: false, azPorsiyon: true, azFiyat: 110, parentId: null, isAzVariant: false },
  { id: 1298, kategori: 'YEMEKLER', altKategori: 'Ana Yemekler', ad: 'Tavuk But (ADET)', fiyat: 85, durum: 'PASIF', menuSirasi: 100, sabit: false, azPorsiyon: false, azFiyat: null, parentId: null, isAzVariant: false },
  { id: 1299, kategori: 'YEMEKLER', altKategori: 'Ana Yemekler', ad: 'Tavuk Şiş (ADET)', fiyat: 85, durum: 'PASIF', menuSirasi: 100, sabit: false, azPorsiyon: false, azFiyat: null, parentId: null, isAzVariant: false },
  { id: 1300, kategori: 'YEMEKLER', altKategori: 'Ana Yemekler', ad: 'Tavuk Sarma (ADET)', fiyat: 165, durum: 'PASIF', menuSirasi: 100, sabit: false, azPorsiyon: false, azFiyat: null, parentId: null, isAzVariant: false },
  { id: 1301, kategori: 'YEMEKLER', altKategori: 'Ana Yemekler', ad: 'Yumurtalı Ispanak (ADET)', fiyat: 130, durum: 'PASIF', menuSirasi: 100, sabit: false, azPorsiyon: false, azFiyat: null, parentId: null, isAzVariant: false },
  { id: 1302, kategori: 'YEMEKLER', altKategori: 'Yoğurt - Z.Yağlı', ad: 'Ev Köftesi (ADET)', fiyat: 80, durum: 'AKTIF', menuSirasi: 1, sabit: false, azPorsiyon: false, azFiyat: null, parentId: null, isAzVariant: false },
  { id: 1303, kategori: 'YEMEKLER', altKategori: 'Yoğurt - Z.Yağlı', ad: 'Şinitsel (ADET)', fiyat: 100, durum: 'AKTIF', menuSirasi: 2, sabit: false, azPorsiyon: false, azFiyat: null, parentId: null, isAzVariant: false },
  { id: 1304, kategori: 'YEMEKLER', altKategori: 'Yoğurt - Z.Yağlı', ad: 'Kadınbudu Köfte (ADET)', fiyat: 85, durum: 'AKTIF', menuSirasi: 3, sabit: false, azPorsiyon: false, azFiyat: null, parentId: null, isAzVariant: false },
  { id: 1305, kategori: 'YEMEKLER', altKategori: 'Yoğurt - Z.Yağlı', ad: 'Fırın Tavuk / Pirzola (ADET)', fiyat: 100, durum: 'PASIF', menuSirasi: 4, sabit: false, azPorsiyon: false, azFiyat: null, parentId: null, isAzVariant: false },
  { id: 1306, kategori: 'YEMEKLER', altKategori: 'Yoğurt - Z.Yağlı', ad: 'Mücver (ADET)', fiyat: 75, durum: 'AKTIF', menuSirasi: 4, sabit: false, azPorsiyon: false, azFiyat: null, parentId: null, isAzVariant: false },
  { id: 1307, kategori: 'YEMEKLER', altKategori: 'Yoğurt - Z.Yağlı', ad: 'ÇORBA', fiyat: 85, durum: 'AKTIF', menuSirasi: 5, sabit: false, azPorsiyon: true, azFiyat: 60, parentId: null, isAzVariant: false },
  { id: 1308, kategori: 'YEMEKLER', altKategori: 'Yoğurt - Z.Yağlı', ad: 'Tatlı (ADET)', fiyat: 95, durum: 'AKTIF', menuSirasi: 7, sabit: false, azPorsiyon: false, azFiyat: null, parentId: null, isAzVariant: false },
  { id: 1309, kategori: 'YEMEKLER', altKategori: 'Yoğurt - Z.Yağlı', ad: 'Yaprak Sarma (ADET)', fiyat: 25, durum: 'AKTIF', menuSirasi: 8, sabit: false, azPorsiyon: false, azFiyat: null, parentId: null, isAzVariant: false },
  { id: 1310, kategori: 'YEMEKLER', altKategori: 'Yoğurt - Z.Yağlı', ad: 'YOĞURT', fiyat: 70, durum: 'AKTIF', menuSirasi: 9, sabit: false, azPorsiyon: true, azFiyat: 50, parentId: null, isAzVariant: false },
  { id: 1311, kategori: 'YEMEKLER', altKategori: 'Yoğurt - Z.Yağlı', ad: 'CACIK', fiyat: 85, durum: 'AKTIF', menuSirasi: 11, sabit: false, azPorsiyon: true, azFiyat: 60, parentId: null, isAzVariant: false },
  { id: 1312, kategori: 'YEMEKLER', altKategori: 'Yoğurt - Z.Yağlı', ad: 'Barbunya Pilaki', fiyat: 80, durum: 'PASIF', menuSirasi: 50, sabit: false, azPorsiyon: true, azFiyat: 60, parentId: null, isAzVariant: false },
  { id: 1313, kategori: 'YEMEKLER', altKategori: 'Yoğurt - Z.Yağlı', ad: 'TAVUK SALATASI', fiyat: 80, durum: 'PASIF', menuSirasi: 50, sabit: false, azPorsiyon: true, azFiyat: 60, parentId: null, isAzVariant: false },
  { id: 1314, kategori: 'YEMEKLER', altKategori: 'Yoğurt - Z.Yağlı', ad: 'BRÜKSEL LAHANASI', fiyat: 85, durum: 'PASIF', menuSirasi: 50, sabit: false, azPorsiyon: true, azFiyat: 60, parentId: null, isAzVariant: false },
  { id: 1315, kategori: 'YEMEKLER', altKategori: 'Yoğurt - Z.Yağlı', ad: 'Fellah Köfte', fiyat: 85, durum: 'PASIF', menuSirasi: 50, sabit: false, azPorsiyon: true, azFiyat: 60, parentId: null, isAzVariant: false },
  { id: 1316, kategori: 'YEMEKLER', altKategori: 'Yoğurt - Z.Yağlı', ad: 'HAVUÇ TARATOR', fiyat: 85, durum: 'PASIF', menuSirasi: 50, sabit: false, azPorsiyon: true, azFiyat: 60, parentId: null, isAzVariant: false },
  { id: 1317, kategori: 'YEMEKLER', altKategori: 'Yoğurt - Z.Yağlı', ad: 'KEREVİZ ZEYTİNYAĞLI', fiyat: 85, durum: 'PASIF', menuSirasi: 50, sabit: false, azPorsiyon: true, azFiyat: 60, parentId: null, isAzVariant: false },
  { id: 1318, kategori: 'YEMEKLER', altKategori: 'Yoğurt - Z.Yağlı', ad: 'KISIR', fiyat: 85, durum: 'PASIF', menuSirasi: 50, sabit: false, azPorsiyon: true, azFiyat: 60, parentId: null, isAzVariant: false },
  { id: 1319, kategori: 'YEMEKLER', altKategori: 'Yoğurt - Z.Yağlı', ad: 'PATATES SALATASI', fiyat: 85, durum: 'PASIF', menuSirasi: 50, sabit: false, azPorsiyon: true, azFiyat: 60, parentId: null, isAzVariant: false },
  { id: 1320, kategori: 'YEMEKLER', altKategori: 'Yoğurt - Z.Yağlı', ad: 'PEMBE SULTAN', fiyat: 85, durum: 'PASIF', menuSirasi: 50, sabit: false, azPorsiyon: true, azFiyat: 60, parentId: null, isAzVariant: false },
  { id: 1321, kategori: 'YEMEKLER', altKategori: 'Yoğurt - Z.Yağlı', ad: 'Pırasa Zeytinyağlı', fiyat: 85, durum: 'PASIF', menuSirasi: 50, sabit: false, azPorsiyon: true, azFiyat: 60, parentId: null, isAzVariant: false },
  { id: 1322, kategori: 'YEMEKLER', altKategori: 'Yoğurt - Z.Yağlı', ad: 'TAVUKLU SALATA', fiyat: 85, durum: 'PASIF', menuSirasi: 50, sabit: false, azPorsiyon: true, azFiyat: 60, parentId: null, isAzVariant: false },
  { id: 1323, kategori: 'YEMEKLER', altKategori: 'Yoğurt - Z.Yağlı', ad: 'YOĞURTLU BEYAZ LAHANA', fiyat: 85, durum: 'PASIF', menuSirasi: 50, sabit: false, azPorsiyon: true, azFiyat: 60, parentId: null, isAzVariant: false },
  { id: 1324, kategori: 'YEMEKLER', altKategori: 'Yoğurt - Z.Yağlı', ad: 'Zeytinyağlı Ispanak', fiyat: 85, durum: 'AKTIF', menuSirasi: 50, sabit: false, azPorsiyon: true, azFiyat: 60, parentId: null, isAzVariant: false },
  { id: 1325, kategori: 'YEMEKLER', altKategori: 'Yoğurt - Z.Yağlı', ad: 'Yoğurtlu Ispanak', fiyat: 85, durum: 'PASIF', menuSirasi: 50, sabit: false, azPorsiyon: true, azFiyat: 60, parentId: null, isAzVariant: false },
  { id: 1326, kategori: 'YEMEKLER', altKategori: 'Yoğurt - Z.Yağlı', ad: 'YOĞURTLU KEREVİZ', fiyat: 85, durum: 'PASIF', menuSirasi: 50, sabit: false, azPorsiyon: true, azFiyat: 60, parentId: null, isAzVariant: false },
  { id: 1327, kategori: 'YEMEKLER', altKategori: 'Yoğurt - Z.Yağlı', ad: 'YOĞURTLU KIRMIZI BİBER', fiyat: 85, durum: 'PASIF', menuSirasi: 50, sabit: false, azPorsiyon: true, azFiyat: 60, parentId: null, isAzVariant: false },
  { id: 1328, kategori: 'YEMEKLER', altKategori: 'Yoğurt - Z.Yağlı', ad: 'Yoğurtlu Pazı', fiyat: 85, durum: 'PASIF', menuSirasi: 50, sabit: false, azPorsiyon: true, azFiyat: 60, parentId: null, isAzVariant: false },
  { id: 1329, kategori: 'YEMEKLER', altKategori: 'Yoğurt - Z.Yağlı', ad: 'MERCİMEK SALATASI', fiyat: 85, durum: 'PASIF', menuSirasi: 50, sabit: false, azPorsiyon: true, azFiyat: 60, parentId: null, isAzVariant: false },
  { id: 1330, kategori: 'YEMEKLER', altKategori: 'Yoğurt - Z.Yağlı', ad: 'Şakşuka', fiyat: 85, durum: 'PASIF', menuSirasi: 50, sabit: false, azPorsiyon: true, azFiyat: 60, parentId: null, isAzVariant: false },
  { id: 1331, kategori: 'YEMEKLER', altKategori: 'Yoğurt - Z.Yağlı', ad: 'Taze Fasulye Zeytinyağlı', fiyat: 85, durum: 'PASIF', menuSirasi: 50, sabit: false, azPorsiyon: true, azFiyat: 60, parentId: null, isAzVariant: false },
  { id: 1332, kategori: 'YEMEKLER', altKategori: 'Yoğurt - Z.Yağlı', ad: 'YOĞURTLU BROKOLİ', fiyat: 85, durum: 'PASIF', menuSirasi: 50, sabit: false, azPorsiyon: true, azFiyat: 60, parentId: null, isAzVariant: false },
  { id: 1333, kategori: 'YEMEKLER', altKategori: 'Yoğurt - Z.Yağlı', ad: 'YOĞURTLU KABAK', fiyat: 85, durum: 'PASIF', menuSirasi: 50, sabit: false, azPorsiyon: true, azFiyat: 60, parentId: null, isAzVariant: false },
  { id: 1334, kategori: 'YEMEKLER', altKategori: 'Yoğurt - Z.Yağlı', ad: 'Yoğurtlu Karnabahar', fiyat: 85, durum: 'PASIF', menuSirasi: 50, sabit: false, azPorsiyon: true, azFiyat: 60, parentId: null, isAzVariant: false },
  { id: 1335, kategori: 'YEMEKLER', altKategori: 'Yoğurt - Z.Yağlı', ad: 'YOĞURTLU PATLICAN', fiyat: 85, durum: 'AKTIF', menuSirasi: 50, sabit: false, azPorsiyon: true, azFiyat: 60, parentId: null, isAzVariant: false },
  { id: 1336, kategori: 'YEMEKLER', altKategori: 'Yoğurt - Z.Yağlı', ad: 'YOĞURTLU SEMİZOTU', fiyat: 85, durum: 'PASIF', menuSirasi: 50, sabit: false, azPorsiyon: true, azFiyat: 60, parentId: null, isAzVariant: false },
  { id: 1337, kategori: 'YEMEKLER', altKategori: 'Yoğurt - Z.Yağlı', ad: 'ZEYTİNYAĞLI BROKOLİ', fiyat: 85, durum: 'PASIF', menuSirasi: 50, sabit: false, azPorsiyon: true, azFiyat: 60, parentId: null, isAzVariant: false },
  { id: 1338, kategori: 'YEMEKLER', altKategori: 'Yoğurt - Z.Yağlı', ad: 'ZEYTİNYAĞLI KARNABAHAR', fiyat: 85, durum: 'PASIF', menuSirasi: 50, sabit: false, azPorsiyon: true, azFiyat: 60, parentId: null, isAzVariant: false },
  { id: 1339, kategori: 'YEMEKLER', altKategori: 'Yoğurt - Z.Yağlı', ad: 'Z.YAĞLI KIRMIZI PANCAR', fiyat: 85, durum: 'AKTIF', menuSirasi: 50, sabit: false, azPorsiyon: true, azFiyat: 60, parentId: null, isAzVariant: false },
  { id: 1340, kategori: 'YEMEKLER', altKategori: 'Yoğurt - Z.Yağlı', ad: 'HAŞLANMIŞ SEBZE', fiyat: 85, durum: 'PASIF', menuSirasi: 50, sabit: false, azPorsiyon: true, azFiyat: 60, parentId: null, isAzVariant: false },
  { id: 1341, kategori: 'YEMEKLER', altKategori: 'Yoğurt - Z.Yağlı', ad: 'YOĞURTLU MAKARNA', fiyat: 85, durum: 'PASIF', menuSirasi: 50, sabit: false, azPorsiyon: true, azFiyat: 60, parentId: null, isAzVariant: false },
  { id: 1342, kategori: 'YEMEKLER', altKategori: 'Yoğurt - Z.Yağlı', ad: 'YOĞURTLU SULTANİ', fiyat: 85, durum: 'PASIF', menuSirasi: 50, sabit: false, azPorsiyon: true, azFiyat: 60, parentId: null, isAzVariant: false },
  { id: 1343, kategori: 'YEMEKLER', altKategori: 'Yoğurt - Z.Yağlı', ad: 'PİYAZ', fiyat: 85, durum: 'PASIF', menuSirasi: 50, sabit: false, azPorsiyon: true, azFiyat: 60, parentId: null, isAzVariant: false },
  { id: 1344, kategori: 'YEMEKLER', altKategori: 'Yoğurt - Z.Yağlı', ad: 'ÇOBAN SALATA', fiyat: 85, durum: 'AKTIF', menuSirasi: 50, sabit: false, azPorsiyon: true, azFiyat: 60, parentId: null, isAzVariant: false },
  { id: 1345, kategori: 'YEMEKLER', altKategori: 'Yoğurt - Z.Yağlı', ad: 'ARPA ŞEHRİYE', fiyat: 85, durum: 'PASIF', menuSirasi: 75, sabit: false, azPorsiyon: true, azFiyat: 60, parentId: null, isAzVariant: false },
  { id: 1346, kategori: 'YEMEKLER', altKategori: 'Yoğurt - Z.Yağlı', ad: 'SPAGETTİ', fiyat: 85, durum: 'PASIF', menuSirasi: 75, sabit: false, azPorsiyon: true, azFiyat: 60, parentId: null, isAzVariant: false },
  { id: 1347, kategori: 'YEMEKLER', altKategori: 'Yoğurt - Z.Yağlı', ad: 'ERİŞTE', fiyat: 85, durum: 'AKTIF', menuSirasi: 75, sabit: false, azPorsiyon: true, azFiyat: 60, parentId: null, isAzVariant: false },
  { id: 1348, kategori: 'YEMEKLER', altKategori: 'Yoğurt - Z.Yağlı', ad: 'BULGUR PİLAVI', fiyat: 85, durum: 'PASIF', menuSirasi: 75, sabit: false, azPorsiyon: true, azFiyat: 60, parentId: null, isAzVariant: false },
  { id: 1349, kategori: 'YEMEKLER', altKategori: 'Yoğurt - Z.Yağlı', ad: 'Zeyt. Biber Dolması (ADET)', fiyat: 70, durum: 'PASIF', menuSirasi: 100, sabit: false, azPorsiyon: false, azFiyat: null, parentId: null, isAzVariant: false },
  { id: 1350, kategori: 'YEMEKLER', altKategori: 'Yoğurt - Z.Yağlı', ad: 'Mercimek Köfte (ADET)', fiyat: 40, durum: 'PASIF', menuSirasi: 100, sabit: false, azPorsiyon: false, azFiyat: null, parentId: null, isAzVariant: false },
  { id: 1351, kategori: 'YEMEKLER', altKategori: 'Yoğurt - Z.Yağlı', ad: 'Un Helvası ( ADET )', fiyat: 45, durum: 'PASIF', menuSirasi: 100, sabit: false, azPorsiyon: false, azFiyat: null, parentId: null, isAzVariant: false },
  { id: 1352, kategori: 'YEMEKLER', altKategori: 'Yoğurt - Z.Yağlı', ad: 'Enginar (ADET)', fiyat: 85, durum: 'PASIF', menuSirasi: 100, sabit: false, azPorsiyon: false, azFiyat: null, parentId: null, isAzVariant: false },
  { id: 1353, kategori: 'Hazır Notlar', altKategori: 'Not Yaz', ad: '.', fiyat: 0, durum: 'AKTIF', menuSirasi: 1, sabit: false, azPorsiyon: false, azFiyat: null, parentId: null, isAzVariant: false },
  { id: 1354, kategori: 'Hazır Notlar', altKategori: 'Not Yaz', ad: 'Dikkat İçecek Var. Kontrol et', fiyat: 0, durum: 'AKTIF', menuSirasi: 2, sabit: false, azPorsiyon: false, azFiyat: null, parentId: null, isAzVariant: false },
  { id: 1355, kategori: 'Hazır Notlar', altKategori: 'Not Yaz', ad: 'EKMEK KOYMA. İstemiyor', fiyat: 0, durum: 'AKTIF', menuSirasi: 3, sabit: false, azPorsiyon: false, azFiyat: null, parentId: null, isAzVariant: false },
  { id: 1356, kategori: 'Hazır Notlar', altKategori: 'Not Yaz', ad: 'Kepek Ekmek Olacak', fiyat: 0, durum: 'AKTIF', menuSirasi: 4, sabit: false, azPorsiyon: false, azFiyat: null, parentId: null, isAzVariant: false },
  { id: 1357, kategori: 'Hazır Notlar', altKategori: 'Not Yaz', ad: 'Nakit Tahsilat', fiyat: 0, durum: 'AKTIF', menuSirasi: 5, sabit: false, azPorsiyon: false, azFiyat: null, parentId: null, isAzVariant: false },
  { id: 1358, kategori: 'Hazır Notlar', altKategori: 'Not Yaz', ad: 'Yemek Kartı Tahsilat', fiyat: 0, durum: 'AKTIF', menuSirasi: 6, sabit: false, azPorsiyon: false, azFiyat: null, parentId: null, isAzVariant: false },
  { id: 1359, kategori: 'Hazır Notlar', altKategori: 'Not Yaz', ad: 'Kredi Kartı Tahsilat', fiyat: 0, durum: 'AKTIF', menuSirasi: 7, sabit: false, azPorsiyon: false, azFiyat: null, parentId: null, isAzVariant: false },
  { id: 1360, kategori: 'Hazır Notlar', altKategori: 'Not Yaz', ad: 'Servis İstemiyor.', fiyat: 0, durum: 'AKTIF', menuSirasi: 8, sabit: false, azPorsiyon: false, azFiyat: null, parentId: null, isAzVariant: false },
  { id: 1361, kategori: 'Hazır Notlar', altKategori: 'Not Yaz', ad: 'Ödeme Alındı.', fiyat: 0, durum: 'AKTIF', menuSirasi: 9, sabit: false, azPorsiyon: false, azFiyat: null, parentId: null, isAzVariant: false },
  { id: 1362, kategori: 'Hazır Notlar', altKategori: 'Not Yaz', ad: 'Cariye Atılacak, ödeme almayalım.', fiyat: 0, durum: 'AKTIF', menuSirasi: 10, sabit: false, azPorsiyon: false, azFiyat: null, parentId: null, isAzVariant: false },
  { id: 1363, kategori: 'Hazır Notlar', altKategori: 'Not Yaz', ad: 'PAKET olarak gelip alacak, ayıralım.', fiyat: 0, durum: 'AKTIF', menuSirasi: 11, sabit: false, azPorsiyon: false, azFiyat: null, parentId: null, isAzVariant: false },
  { id: 1364, kategori: 'Hazır Notlar', altKategori: 'Not Yaz', ad: 'TABAKTA alacak, ayıralım.', fiyat: 0, durum: 'AKTIF', menuSirasi: 12, sabit: false, azPorsiyon: false, azFiyat: null, parentId: null, isAzVariant: false },
  { id: 1365, kategori: 'Hazır Notlar', altKategori: 'Not Yaz', ad: 'Porselen Tabakta Gidecek.', fiyat: 0, durum: 'AKTIF', menuSirasi: 13, sabit: false, azPorsiyon: false, azFiyat: null, parentId: null, isAzVariant: false },
  { id: 1366, kategori: 'Hazır Notlar', altKategori: 'Not Yaz', ad: 'İkiye Bölelim.', fiyat: 0, durum: 'AKTIF', menuSirasi: 14, sabit: false, azPorsiyon: false, azFiyat: null, parentId: null, isAzVariant: false },
  { id: 1367, kategori: 'Hazır Notlar', altKategori: 'Not Yaz', ad: 'Baharat Ekleyelim.', fiyat: 0, durum: 'AKTIF', menuSirasi: 15, sabit: false, azPorsiyon: false, azFiyat: null, parentId: null, isAzVariant: false },
  { id: 1368, kategori: 'Hazır Notlar', altKategori: 'Not Yaz', ad: 'Ayrı Tabak Siparişi', fiyat: 0, durum: 'AKTIF', menuSirasi: 16, sabit: false, azPorsiyon: false, azFiyat: null, parentId: null, isAzVariant: false },
  { id: 1369, kategori: 'Hazır Notlar', altKategori: 'Para Üstü', ad: 'Nakit 200 TL İçin', fiyat: 0, durum: 'AKTIF', menuSirasi: 1, sabit: false, azPorsiyon: false, azFiyat: null, parentId: null, isAzVariant: false },
  { id: 1370, kategori: 'Hazır Notlar', altKategori: 'Para Üstü', ad: 'Nakit 400 TL İçin', fiyat: 0, durum: 'AKTIF', menuSirasi: 2, sabit: false, azPorsiyon: false, azFiyat: null, parentId: null, isAzVariant: false },
  { id: 1371, kategori: 'Hazır Notlar', altKategori: 'Para Üstü', ad: 'TL Para Üstü Yanına al', fiyat: 0, durum: 'AKTIF', menuSirasi: 3, sabit: false, azPorsiyon: false, azFiyat: null, parentId: null, isAzVariant: false },
];
const DEFAULT_CATEGORIES = [
  { name: 'İÇECEKLER', menuSirasi: 10, sabit: false },
  { name: 'KAHVALTI', menuSirasi: 20, sabit: false },
  { name: 'SALATALAR', menuSirasi: 30, sabit: false },
  { name: 'SICAK SANDVİÇ', menuSirasi: 40, sabit: false },
  { name: 'SICAK YUMURTA', menuSirasi: 50, sabit: false },
  { name: 'SOĞUK SANDVİÇ', menuSirasi: 60, sabit: false },
  { name: 'TATLI SANDVİÇ', menuSirasi: 70, sabit: false },
  { name: 'YEMEKLER', menuSirasi: 80, sabit: false },
  { name: 'Hazır Notlar', menuSirasi: 90, sabit: false },
];

const DEFAULT_SUBCATEGORIES = [
  { kategori: 'İÇECEKLER', name: 'Sıcak İçeçekler', menuSirasi: 10 },
  { kategori: 'İÇECEKLER', name: 'Soğuk İçeçekler', menuSirasi: 20 },
  { kategori: 'KAHVALTI', name: 'Kahvaltı Çeşitleri', menuSirasi: 10 },
  { kategori: 'KAHVALTI', name: 'Kahvaltı Tabağı', menuSirasi: 20 },
  { kategori: 'KAHVALTI', name: 'Pastahane Çeşitleri', menuSirasi: 30 },
  { kategori: 'SALATALAR', name: 'BÜYÜK Salata', menuSirasi: 10 },
  { kategori: 'SALATALAR', name: 'Küçük Salata', menuSirasi: 20 },
  { kategori: 'SICAK SANDVİÇ', name: 'BÜYÜK Sıcak Sandviç', menuSirasi: 10 },
  { kategori: 'SICAK SANDVİÇ', name: 'Küçük Sıcak Sandviç', menuSirasi: 20 },
  { kategori: 'SICAK SANDVİÇ', name: 'Sıcak Tabak', menuSirasi: 30 },
  { kategori: 'SICAK YUMURTA', name: 'Melemen', menuSirasi: 10 },
  { kategori: 'SICAK YUMURTA', name: 'Omlet', menuSirasi: 20 },
  { kategori: 'SICAK YUMURTA', name: 'Sahanda Yumurta', menuSirasi: 30 },
  { kategori: 'SOĞUK SANDVİÇ', name: 'BÜYÜK Sandviç', menuSirasi: 10 },
  { kategori: 'SOĞUK SANDVİÇ', name: 'Küçük Sandviç', menuSirasi: 20 },
  { kategori: 'SOĞUK SANDVİÇ', name: 'Menü Sandviç ( BÜYÜK )', menuSirasi: 30 },
  { kategori: 'SOĞUK SANDVİÇ', name: 'Menü Sandviç ( Küçük )', menuSirasi: 40 },
  { kategori: 'TATLI SANDVİÇ', name: 'BÜYÜK Tatlı Sandviç', menuSirasi: 10 },
  { kategori: 'TATLI SANDVİÇ', name: 'Küçük Tatlı Sandviç', menuSirasi: 20 },
  { kategori: 'YEMEKLER', name: 'Ana Yemekler', menuSirasi: 10 },
  { kategori: 'YEMEKLER', name: 'Yoğurt - Z.Yağlı', menuSirasi: 20 },
  { kategori: 'Hazır Notlar', name: 'Not Yaz', menuSirasi: 10 },
  { kategori: 'Hazır Notlar', name: 'Para Üstü', menuSirasi: 20 },
];

export const QUICK_SALE = '⚡ Hızlı Satış';
export const SALON_TABLES = ['Masa 1', 'Masa 2', 'Masa 3', 'Masa 4', 'Masa 5', 'Masa 6', 'Masa 7', 'Masa 8', 'Masa 9', 'Masa 10', 'Masa 11'];
export const ALT_TABLES = ['Alt Masa 1', 'Alt Masa 2', 'Alt Masa 3', 'Alt Masa 4', 'Alt Masa 5', 'Alt Masa 6'];
// Fiziksel olarak birleşik duran masalar (görsel gruplama için) — birleştirme yine serbest.
export const TABLE_PAIRS = [['Masa 3', 'Masa 4'], ['Masa 10', 'Masa 11']];
const FIXED_TABLES = [QUICK_SALE, ...SALON_TABLES, ...ALT_TABLES];

export const TL = (n) => (n || 0).toLocaleString('tr-TR', { minimumFractionDigits: 2 }) + ' ₺';

function loadLS(key, fallback) {
  try {
    const v = localStorage.getItem(key);
    return v ? JSON.parse(v) : fallback;
  } catch {
    return fallback;
  }
}

function emptyTableMap(tables, fill) {
  const o = {};
  tables.forEach((t) => (o[t] = typeof fill === 'function' ? fill() : fill));
  return o;
}

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

// ---- Masa rengi: geçen süreye göre kademe (30 dk aralıklarla) ----
export function getElapsedMinutes(openedAt) {
  if (!openedAt) return 0;
  return Math.max(0, Math.floor((Date.now() - openedAt) / 60000));
}
export function getColorTier(openedAt) {
  if (!openedAt) return -1; // boş masa
  const mins = getElapsedMinutes(openedAt);
  if (mins < 30) return 0;
  if (mins < 60) return 1;
  if (mins < 90) return 2;
  return 3;
}

// ---- Supabase satırı <-> uygulama nesnesi dönüşümleri ----
function rowToSale(r) {
  return { id: r.id, ts: Number(r.ts), table: r.table_name, amount: Number(r.amount), method: r.method, itemsCount: r.items_count, date: r.date_display };
}
function rowToSoldItem(r) {
  return { id: r.id, ts: Number(r.ts), ad: r.ad, fiyat: Number(r.fiyat), kategori: r.kategori || '', altKategori: r.alt_kategori || '', table: r.table_name };
}
function rowToAction(r) {
  return { id: r.id, description: r.description, time: r.time_display, snapshot: r.snapshot };
}
function rowToCari(r) {
  return {
    id: r.id,
    tip: r.tip,
    ad: r.ad,
    telefon: r.telefon || '',
    adres: r.adres || '',
    not: r.kisa_not || '',
    aciklama: r.aciklama || '',
    olusturmaTs: r.created_at ? new Date(r.created_at).getTime() : Date.now(),
  };
}
function rowToHareket(r) {
  return { id: r.id, cariId: r.cari_id, ts: Number(r.ts), urunler: r.urunler || [], toplam: Number(r.toplam), mutfakNotu: r.mutfak_notu || '' };
}
function rowToOdeme(r) {
  return { id: r.id, cariId: r.cari_id, ts: Number(r.ts), tutar: Number(r.tutar), tur: r.tur };
}
function rowToFatura(r) {
  return { id: r.id, cariId: r.cari_id, tarih: r.tarih, faturaNo: r.fatura_no, tutar: Number(r.tutar), eklenmeTs: Number(r.eklenme_ts) };
}
function rowToGecmis(r) {
  return { id: r.id, cariId: r.cari_id, ts: Number(r.ts), toplamTutar: Number(r.toplam_tutar), aciklama: r.aciklama };
}

// Tüm sayfaların (DirectSale, Tables, Reports...) paylaştığı tek veri kaynağı.
// App.jsx içinde BİR KEZ çağrılır, sonuçlar prop olarak sayfalara aktarılır.
//
// VERİ MİMARİSİ:
//  - Ürün / kategori / alt kategori / favoriler: nadiren değişir, Google Sheets ile
//    senkronize olur, tarayıcıda (localStorage) tutulur — bu kısım değişmedi.
//  - Masalar / paketler / siparişler / satış geçmişi / cari: saniyeler içinde değişir,
//    birden fazla cihaz aynı anda kullanacağı için Supabase'de tutulur ve gerçek
//    zamanlı (realtime) abonelikle her cihaza anında yansır.
export default function useHipposData() {
  // ================== ÜRÜN / KATEGORİ (Sheets ile senkron, localStorage) ==================
  const [products, setProducts] = useState(() => loadLS('hippos_products', DEFAULT_PRODUCTS));
  const [categories, setCategories] = useState(() => loadLS('hippos_categories', DEFAULT_CATEGORIES));
  const [subcategories, setSubcategories] = useState(() => loadLS('hippos_subcategories', DEFAULT_SUBCATEGORIES));
  const [favorites, setFavorites] = useState(() => loadLS('hippos_favorites', [104, 101, 105]));

  useEffect(() => localStorage.setItem('hippos_products', JSON.stringify(products)), [products]);
  useEffect(() => localStorage.setItem('hippos_categories', JSON.stringify(categories)), [categories]);
  useEffect(() => localStorage.setItem('hippos_subcategories', JSON.stringify(subcategories)), [subcategories]);
  useEffect(() => localStorage.setItem('hippos_favorites', JSON.stringify(favorites)), [favorites]);

  function toggleFavorite(id) {
    setFavorites((prev) => (prev.includes(id) ? prev.filter((f) => f !== id) : [...prev, id]));
  }

  // Bir ürünü aç/kapa — "Az X" varyantı varsa onu da aynı duruma çeker (bağımsız açık olamaz).
  function toggleProductStatus(id) {
    setProducts((prev) => {
      const target = prev.find((p) => p.id === id);
      if (!target) return prev;
      const nextDurum = target.durum === 'PASIF' ? 'AKTIF' : 'PASIF';
      return prev.map((p) => {
        if (p.id === id) return { ...p, durum: nextDurum };
        if (p.parentId === id) return { ...p, durum: nextDurum };
        return p;
      });
    });
  }

  // Kategori bazlı toplu aç/kapa — "Sabit Ürün" işaretli ürünler pasife alınırken atlanır.
  function bulkSetCategoryStatus(kategori, durum) {
    setProducts((prev) =>
      prev.map((p) => {
        if (p.kategori !== kategori) return p;
        if (durum === 'PASIF' && p.sabit) return p;
        if (p.isAzVariant) {
          const parent = prev.find((q) => q.id === p.parentId);
          if (parent && parent.sabit && durum === 'PASIF') return p;
        }
        return { ...p, durum };
      })
    );
  }

  function addCategory(name) {
    const trimmed = name.trim();
    if (!trimmed) return;
    setCategories((prev) => {
      if (prev.some((c) => c.name.toLowerCase() === trimmed.toLowerCase())) return prev;
      const maxOrder = prev.reduce((m, c) => Math.max(m, c.menuSirasi), 0);
      return [...prev, { name: trimmed, menuSirasi: Math.min(100, maxOrder + 10) || 10, sabit: false }];
    });
  }

  function updateCategoryMeta(name, patch) {
    setCategories((prev) => prev.map((c) => (c.name === name ? { ...c, ...patch } : c)));
  }

  function addSubcategory(kategori, name) {
    const trimmed = name.trim();
    if (!trimmed) return;
    setSubcategories((prev) => {
      if (prev.some((s) => s.kategori === kategori && s.name.toLowerCase() === trimmed.toLowerCase())) return prev;
      const siblings = prev.filter((s) => s.kategori === kategori);
      const maxOrder = siblings.reduce((m, s) => Math.max(m, s.menuSirasi), 0);
      return [...prev, { kategori, name: trimmed, menuSirasi: Math.min(100, maxOrder + 10) || 10 }];
    });
  }

  function updateSubcategoryMeta(kategori, name, patch) {
    setSubcategories((prev) => prev.map((s) => (s.kategori === kategori && s.name === name ? { ...s, ...patch } : s)));
  }

  function addProduct(product) {
    const id = Date.now() + Math.random();
    setProducts((prev) => [
      ...prev,
      {
        id,
        kategori: product.kategori,
        altKategori: product.altKategori || '',
        ad: product.ad,
        fiyat: product.fiyat || 0,
        durum: 'AKTIF',
        menuSirasi: product.menuSirasi ?? 50,
        sabit: false,
        azPorsiyon: false,
        azFiyat: null,
        parentId: null,
        isAzVariant: false,
      },
    ]);
    return id;
  }

  function updateProduct(id, patch) {
    setProducts((prev) => prev.map((p) => (p.id === id ? { ...p, ...patch } : p)));
  }

  function deleteProduct(id) {
    setProducts((prev) => prev.filter((p) => p.id !== id && p.parentId !== id));
  }

  function setAzPorsiyon(id, enabled, azFiyat) {
    setProducts((prev) => {
      const parent = prev.find((p) => p.id === id);
      if (!parent) return prev;
      if (enabled) {
        const already = prev.find((p) => p.parentId === id);
        if (already) {
          return prev.map((p) =>
            p.id === id ? { ...p, azPorsiyon: true, azFiyat }
            : p.id === already.id ? { ...p, ad: `Az ${parent.ad}`, fiyat: azFiyat }
            : p
          );
        }
        const azProduct = {
          id: Date.now() + Math.random(),
          kategori: parent.kategori,
          altKategori: parent.altKategori,
          ad: `Az ${parent.ad}`,
          fiyat: azFiyat || 0,
          durum: parent.durum,
          menuSirasi: parent.menuSirasi,
          sabit: false,
          azPorsiyon: false,
          azFiyat: null,
          parentId: id,
          isAzVariant: true,
        };
        return [...prev.map((p) => (p.id === id ? { ...p, azPorsiyon: true, azFiyat } : p)), azProduct];
      }
      return prev
        .filter((p) => p.parentId !== id)
        .map((p) => (p.id === id ? { ...p, azPorsiyon: false, azFiyat: null } : p));
    });
  }

  // ================== CANLI VERİ (Supabase + gerçek zamanlı) ==================
  const [orders, setOrders] = useState(() => emptyTableMap(FIXED_TABLES, []));
  const [tableNotes, setTableNotes] = useState(() => emptyTableMap(FIXED_TABLES, ''));
  const [tableDiscounts, setTableDiscounts] = useState(() => emptyTableMap(FIXED_TABLES, () => ({ type: null, value: 0 })));
  const [tableOpenedAt, setTableOpenedAt] = useState({});
  const [packages, setPackages] = useState([]);
  const [packageMeta, setPackageMeta] = useState({ date: todayStr(), next: 1 });
  const [salesHistory, setSalesHistory] = useState([]);
  const [soldItems, setSoldItems] = useState([]);
  const [actionHistory, setActionHistory] = useState([]);
  const [cariler, setCariler] = useState([]);
  const [cariHareketler, setCariHareketler] = useState([]);
  const [cariOdemeler, setCariOdemeler] = useState([]);
  const [cariFaturalar, setCariFaturalar] = useState([]);
  const [cariGecmis, setCariGecmis] = useState([]);

  const allTables = useMemo(() => [...FIXED_TABLES, ...packages.map((p) => p.name)], [packages]);

  // ================== "Kim nerede" — aynı masaya iki cihazın aynı anda girmesini uyarmak için ==================
  const deviceIdRef = useRef(Math.random().toString(36).slice(2, 10));
  const presenceChannelRef = useRef(null);
  const [presenceMap, setPresenceMap] = useState({}); // { [tableName]: [deviceId, ...] }

  useEffect(() => {
    const channel = supabase.channel('hippos-presence', {
      config: { presence: { key: deviceIdRef.current } },
    });
    channel
      .on('presence', { event: 'sync' }, () => {
        const state = channel.presenceState();
        const map = {};
        Object.entries(state).forEach(([deviceId, metas]) => {
          const meta = metas[metas.length - 1];
          if (meta && meta.table) {
            (map[meta.table] = map[meta.table] || []).push(deviceId);
          }
        });
        setPresenceMap(map);
      })
      .subscribe();
    presenceChannelRef.current = channel;
    return () => supabase.removeChannel(channel);
  }, []);

  // Bir cihaz bir masayı ekranda açtığında çağrılır — diğer cihazlar bunu anında görür.
  function announceViewingTable(table) {
    presenceChannelRef.current?.track({ table, ts: Date.now() });
  }

  // Cihaz Hızlı Satış ekranından tamamen ayrılınca (Masalar/Ayarlar'a geçince) çağrılır —
  // yoksa son bakılan masa "başka cihazda açık" görünmeye sonsuza kadar devam eder.
  function clearViewingTable() {
    presenceChannelRef.current?.untrack();
  }

  // Bir masada, KENDİMİZ DIŞINDA, o an ekranında duran başka bir cihaz var mı?
  function isTableOccupiedElsewhere(table) {
    const viewers = presenceMap[table] || [];
    return viewers.some((id) => id !== deviceIdRef.current);
  }

  // ---- İlk yükleme + gerçek zamanlı abonelikler ----
  useEffect(() => {
    let cancelled = false;

    async function loadAll() {
      const [ts, pk, pm, sh, si, ah, cr, ch, co, cf, cg] = await Promise.all([
        supabase.from('table_state').select('*'),
        supabase.from('packages').select('*'),
        supabase.from('package_meta').select('*').eq('id', 1).maybeSingle(),
        supabase.from('sales_history').select('*'),
        supabase.from('sold_items').select('*'),
        supabase.from('action_history').select('*').order('created_at', { ascending: false }).limit(5),
        supabase.from('cariler').select('*'),
        supabase.from('cari_hareketler').select('*'),
        supabase.from('cari_odemeler').select('*'),
        supabase.from('cari_faturalar').select('*'),
        supabase.from('cari_gecmis').select('*'),
      ]);
      if (cancelled) return;

      const o = emptyTableMap(FIXED_TABLES, []);
      const n = emptyTableMap(FIXED_TABLES, '');
      const d = emptyTableMap(FIXED_TABLES, () => ({ type: null, value: 0 }));
      const oa = {};
      (ts.data || []).forEach((row) => {
        o[row.table_name] = row.items || [];
        n[row.table_name] = row.note || '';
        d[row.table_name] = { type: row.discount_type, value: row.discount_value || 0 };
        if (row.opened_at) oa[row.table_name] = new Date(row.opened_at).getTime();
      });
      setOrders(o);
      setTableNotes(n);
      setTableDiscounts(d);
      setTableOpenedAt(oa);
      setPackages((pk.data || []).map((r) => ({ name: r.name, num: r.num })));
      if (pm.data) setPackageMeta({ date: pm.data.meta_date, next: pm.data.next_num });
      setSalesHistory((sh.data || []).map(rowToSale).sort((a, b) => b.ts - a.ts));
      setSoldItems((si.data || []).map(rowToSoldItem));
      setActionHistory((ah.data || []).map(rowToAction));
      setCariler((cr.data || []).map(rowToCari));
      setCariHareketler((ch.data || []).map(rowToHareket));
      setCariOdemeler((co.data || []).map(rowToOdeme));
      setCariFaturalar((cf.data || []).map(rowToFatura));
      setCariGecmis((cg.data || []).map(rowToGecmis));
    }
    loadAll();

    const channel = supabase
      .channel('hippos-live')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'table_state' }, (payload) => {
        if (payload.eventType === 'DELETE') return;
        const row = payload.new;
        const t = row.table_name;
        setOrders((prev) => ({ ...prev, [t]: row.items || [] }));
        setTableNotes((prev) => ({ ...prev, [t]: row.note || '' }));
        setTableDiscounts((prev) => ({ ...prev, [t]: { type: row.discount_type, value: row.discount_value || 0 } }));
        setTableOpenedAt((prev) => {
          const next = { ...prev };
          if (row.opened_at) next[t] = new Date(row.opened_at).getTime();
          else delete next[t];
          return next;
        });
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'packages' }, () => {
        supabase.from('packages').select('*').then(({ data }) => setPackages((data || []).map((r) => ({ name: r.name, num: r.num }))));
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'package_meta' }, (payload) => {
        if (payload.new) setPackageMeta({ date: payload.new.meta_date, next: payload.new.next_num });
      })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'sales_history' }, (payload) => {
        setSalesHistory((prev) => (prev.some((s) => s.id === payload.new.id) ? prev : [rowToSale(payload.new), ...prev]));
      })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'sold_items' }, (payload) => {
        setSoldItems((prev) => (prev.some((s) => s.id === payload.new.id) ? prev : [rowToSoldItem(payload.new), ...prev]));
      })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'action_history' }, (payload) => {
        setActionHistory((prev) => (prev.some((a) => a.id === payload.new.id) ? prev : [rowToAction(payload.new), ...prev].slice(0, 5)));
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'cariler' }, (payload) => {
        if (payload.eventType === 'DELETE') {
          setCariler((prev) => prev.filter((c) => c.id !== payload.old.id));
          return;
        }
        const row = rowToCari(payload.new);
        setCariler((prev) => (prev.some((c) => c.id === row.id) ? prev.map((c) => (c.id === row.id ? row : c)) : [...prev, row]));
      })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'cari_hareketler' }, (payload) => {
        setCariHareketler((prev) => (prev.some((h) => h.id === payload.new.id) ? prev : [...prev, rowToHareket(payload.new)]));
      })
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'cari_hareketler' }, (payload) => {
        setCariHareketler((prev) => prev.filter((h) => h.id !== payload.old.id));
      })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'cari_odemeler' }, (payload) => {
        setCariOdemeler((prev) => (prev.some((o) => o.id === payload.new.id) ? prev : [...prev, rowToOdeme(payload.new)]));
      })
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'cari_odemeler' }, (payload) => {
        setCariOdemeler((prev) => prev.filter((o) => o.id !== payload.old.id));
      })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'cari_faturalar' }, (payload) => {
        setCariFaturalar((prev) => (prev.some((f) => f.id === payload.new.id) ? prev : [...prev, rowToFatura(payload.new)]));
      })
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'cari_faturalar' }, (payload) => {
        setCariFaturalar((prev) => prev.filter((f) => f.id !== payload.old.id));
      })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'cari_gecmis' }, (payload) => {
        setCariGecmis((prev) => (prev.some((g) => g.id === payload.new.id) ? prev : [...prev, rowToGecmis(payload.new)]));
      })
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') console.log('✅ Hippos canlı senkron bağlandı');
        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') console.error('❌ Hippos canlı senkron bağlanamadı:', status);
      });

    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, []);

  // ---- Masa/paket/hızlı satış durumu senkronu — SADECE gerçekten değişen masa(lar) gönderilir.
  // Önceki "her değişiklikte tüm masaları toptan gönder" yaklaşımı, iki cihaz aynı anda işlem
  // yapınca birbirinin verisinin üzerine eski bir kopya yazıyordu (yarış durumu / veri kaybı riski).
  const prevTableStateRef = useRef({ orders: {}, tableNotes: {}, tableDiscounts: {}, tableOpenedAt: {} });
  useEffect(() => {
    const prev = prevTableStateRef.current;
    const changed = new Set();
    allTables.forEach((t) => {
      if (orders[t] !== prev.orders[t]) changed.add(t);
      if (tableNotes[t] !== prev.tableNotes[t]) changed.add(t);
      if (tableDiscounts[t] !== prev.tableDiscounts[t]) changed.add(t);
      if (tableOpenedAt[t] !== prev.tableOpenedAt[t]) changed.add(t);
    });
    prevTableStateRef.current = { orders, tableNotes, tableDiscounts, tableOpenedAt };
    if (changed.size === 0) return;

    const rows = [...changed].map((t) => ({
      table_name: t,
      items: orders[t] || [],
      note: tableNotes[t] || '',
      discount_type: (tableDiscounts[t] || {}).type ?? null,
      discount_value: (tableDiscounts[t] || {}).value ?? 0,
      opened_at: tableOpenedAt[t] ? new Date(tableOpenedAt[t]).toISOString() : null,
      updated_at: new Date().toISOString(),
    }));
    supabase.from('table_state').upsert(rows, { onConflict: 'table_name' }).then(({ error }) => {
      if (error) console.error('Masa durumu senkronize edilemedi:', error.message);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orders, tableNotes, tableDiscounts, tableOpenedAt, allTables]);

  // ---- Yeni satış kayıtlarını Supabase'e yaz (DirectSale doğrudan setSalesHistory çağırıyor) ----
  const syncedSaleIdsRef = useRef(new Set()).current;
  useEffect(() => {
    const newOnes = salesHistory.filter((s) => !syncedSaleIdsRef.has(s.id));
    if (newOnes.length === 0) return;
    newOnes.forEach((s) => syncedSaleIdsRef.add(s.id));
    const rows = newOnes.map((s) => ({ id: s.id, ts: s.ts, table_name: s.table, amount: s.amount, method: s.method, items_count: s.itemsCount, date_display: s.date }));
    supabase.from('sales_history').insert(rows).then(({ error }) => {
      if (error) console.error('Satış kaydı senkronize edilemedi:', error.message);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [salesHistory]);

  // İlk yükleme sırasında Supabase'ten gelen kayıtları "zaten senkron" olarak işaretle
  useEffect(() => {
    salesHistory.forEach((s) => syncedSaleIdsRef.add(s.id));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Sipariş güncellemesi — masa boştan doluya geçince açılış saatini otomatik damgalar,
  // doluyken boşalınca damgayı siler (masa "kapanmış" sayılır). Gerçek yazma işi yukarıdaki
  // toplu senkron efektinde oluyor.
  function updateOrder(table, updater) {
    setOrders((prev) => {
      const before = prev[table] || [];
      const after = updater(before);
      const wasEmpty = before.length === 0;
      const nowEmpty = after.length === 0;
      if (wasEmpty && !nowEmpty) {
        setTableOpenedAt((p) => (p[table] ? p : { ...p, [table]: Date.now() }));
        registerPackageIfNeeded(table);
      } else if (!wasEmpty && nowEmpty) {
        setTableOpenedAt((p) => {
          if (!(table in p)) return p;
          const n = { ...p };
          delete n[table];
          return n;
        });
      }
      return { ...prev, [table]: after };
    });
  }

  function updateTableNote(table, value) {
    if (value.trim()) registerPackageIfNeeded(table);
    setTableNotes((prev) => ({ ...prev, [table]: value }));
  }

  function getTableTotal(table) {
    const items = orders[table] || [];
    const subtotal = items.reduce((s, i) => s + (i.note ? 0 : i.fiyat), 0);
    const d = tableDiscounts[table];
    let discount = 0;
    if (d && d.value > 0) {
      discount = d.type === 'percent' ? (subtotal * d.value) / 100 : d.value;
    }
    return Math.max(0, subtotal - discount);
  }

  // ---- Paketler ----
  function openPackage() {
    let meta = packageMeta;
    if (meta.date !== todayStr()) meta = { date: todayStr(), next: 1 };
    const num = meta.next;
    const name = `Paket ${num}`;
    const nextMeta = { date: meta.date, next: num + 1 };
    setPackageMeta(nextMeta);
    setTableNotes((prev) => ({ ...prev, [name]: '' }));
    setTableDiscounts((prev) => ({ ...prev, [name]: { type: null, value: 0 } }));
    supabase
      .from('package_meta')
      .upsert({ id: 1, meta_date: nextMeta.date, next_num: nextMeta.next })
      .then(({ error }) => { if (error) console.error('paket sayacı güncellenemedi:', error.message); });
    return name;
  }

  function registerPackageIfNeeded(table) {
    if (!table.startsWith('Paket ')) return;
    setPackages((prev) => {
      if (prev.some((p) => p.name === table)) return prev;
      const num = parseInt(table.replace('Paket ', ''), 10) || 0;
      supabase.from('packages').insert({ name: table, num }).then(({ error }) => {
        if (error) console.error('paket eklenemedi:', error.message);
      });
      return [...prev, { name: table, num }];
    });
  }

  function removePackageRecord(name) {
    setPackages((prev) => prev.filter((p) => p.name !== name));
    setTableOpenedAt((p) => {
      if (!(name in p)) return p;
      const n = { ...p };
      delete n[name];
      return n;
    });
    supabase.from('packages').delete().eq('name', name).then(({ error }) => {
      if (error) console.error('paket silinemedi:', error.message);
    });
    supabase.from('table_state').delete().eq('table_name', name).then(({ error }) => {
      if (error) console.error('paket durumu silinemedi:', error.message);
    });
  }

  // ---- Geri al geçmişi (son 5 işlem, tam durum anlık görüntüsü ile) ----
  function snapshotState() {
    return { orders, tableNotes, tableDiscounts, tableOpenedAt, packages, packageMeta };
  }
  function pushHistory(description) {
    const entry = {
      id: Date.now() + Math.random(),
      description,
      time: new Date().toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' }),
      snapshot: snapshotState(),
    };
    setActionHistory((prev) => [entry, ...prev].slice(0, 5));
    supabase
      .from('action_history')
      .insert({ description: entry.description, time_display: entry.time, snapshot: entry.snapshot })
      .then(({ error }) => { if (error) console.error('işlem geçmişi kaydedilemedi:', error.message); });
  }
  function undoLastAction() {
    setActionHistory((prev) => {
      if (prev.length === 0) return prev;
      const [last, ...rest] = prev;
      const s = last.snapshot;
      setOrders(s.orders);
      setTableNotes(s.tableNotes);
      setTableDiscounts(s.tableDiscounts);
      setTableOpenedAt(s.tableOpenedAt);
      setPackages(s.packages);
      setPackageMeta(s.packageMeta);
      return rest;
    });
  }

  // ---- Masa taşı / birleştir (Masalar ekranından, herhangi iki masa arasında) ----
  function transferTable(from, to) {
    if (from === to) return;
    pushHistory(`${from} → ${to} taşındı`);
    setOrders((prev) => ({ ...prev, [to]: prev[from] || [], [from]: [] }));
    setTableNotes((prev) => ({ ...prev, [to]: prev[from] || '', [from]: '' }));
    setTableDiscounts((prev) => ({ ...prev, [to]: prev[from] || { type: null, value: 0 }, [from]: { type: null, value: 0 } }));
    setTableOpenedAt((prev) => {
      const n = { ...prev };
      if (prev[from]) n[to] = prev[from]; else delete n[to];
      delete n[from];
      return n;
    });
    if (from.startsWith('Paket ')) removePackageRecord(from);
  }

  function mergeTable(from, to) {
    if (from === to) return;
    pushHistory(`${from} + ${to} birleştirildi`);
    setOrders((prev) => ({ ...prev, [to]: [...(prev[to] || []), ...(prev[from] || [])], [from]: [] }));
    setTableNotes((prev) => {
      const merged = [prev[to], prev[from]].filter(Boolean).join(' | ');
      return { ...prev, [to]: merged, [from]: '' };
    });
    setTableOpenedAt((prev) => {
      const n = { ...prev };
      const a = prev[to];
      const b = prev[from];
      if (a && b) n[to] = Math.min(a, b);
      else if (b) n[to] = b;
      delete n[from];
      return n;
    });
    if (from.startsWith('Paket ')) removePackageRecord(from);
  }

  // Bir satışı Google Sheets'e KALICI kayıt olarak yazar (Fişler + Fiş Detayları sekmeleri,
  // yıl bazlı otomatik arşiv). Kullanıcıyı asla bekletmez — fiş numarası al, arka planda gönder.
  function writeReceiptToSheets({ tur, masa, toplam, odemeTuru, urunler }) {
    supabase
      .from('receipt_seq')
      .insert({})
      .select('id')
      .single()
      .then(({ data, error }) => {
        if (error || !data) {
          console.error('fiş numarası alınamadı:', error?.message);
          return;
        }
        const now = new Date();
        fetch('/api/receipt', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            fisNo: data.id,
            tarih: now.toLocaleDateString('tr-TR'),
            saat: now.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' }),
            tur,
            masa,
            toplam,
            odemeTuru,
            urunler,
          }),
        }).catch((e) => console.error('fiş Sheets\'e yazılamadı:', e.message));
      });
  }

  // ---- Masayı ödeme ile tamamen kapat (Masalar ekranından, 3 nokta > Masayı Kapat) ----
  function closeTableWithPayment(table, method) {
    const items = orders[table] || [];
    const payable = items.filter((i) => !i.note);
    if (payable.length === 0) return;
    const totalPay = payable.reduce((s, i) => s + i.fiyat, 0);
    logSoldItems(payable, table);
    pushHistory(`${table} kapatıldı (${method})`);
    setSalesHistory((prev) => [
      { id: Date.now(), ts: Date.now(), table, amount: totalPay, method, itemsCount: payable.length, date: new Date().toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' }) },
      ...prev,
    ]);
    writeReceiptToSheets({
      tur: table.startsWith('Paket ') ? 'Paket' : table === QUICK_SALE ? 'Hızlı Satış' : 'Masa',
      masa: table,
      toplam: totalPay,
      odemeTuru: method,
      urunler: payable.map((i) => ({ ad: i.ad, fiyat: i.fiyat })),
    });
    setOrders((prev) => ({ ...prev, [table]: [] }));
    setTableNotes((prev) => ({ ...prev, [table]: '' }));
    setTableDiscounts((prev) => ({ ...prev, [table]: { type: null, value: 0 } }));
    setTableOpenedAt((prev) => {
      if (!(table in prev)) return prev;
      const n = { ...prev };
      delete n[table];
      return n;
    });
    if (table.startsWith('Paket ')) removePackageRecord(table);
  }

  // Ödemesi alınan ürünleri (Bugün paneli / en çok satanlar için hızlı önbellek — kalıcı
  // kayıt Sheets'tedir) kalıcı günlüğe yazar.
  function logSoldItems(items, table) {
    if (!items || items.length === 0) return;
    const ts = Date.now();
    const rows = items
      .filter((i) => !i.note)
      .map((i) => ({
        id: `${ts}-${i.id}`,
        ad: i.ad,
        fiyat: i.fiyat,
        kategori: i.kategori || '',
        altKategori: i.altKategori || '',
        table,
        ts,
      }));
    if (rows.length === 0) return;
    setSoldItems((prev) => [...rows, ...prev]);
    supabase
      .from('sold_items')
      .insert(rows.map((r) => ({ id: r.id, ts: r.ts, ad: r.ad, fiyat: r.fiyat, kategori: r.kategori, alt_kategori: r.altKategori, table_name: r.table })))
      .then(({ error }) => { if (error) console.error('satılan ürün kaydedilemedi:', error.message); });
  }

  // ================== CARİ YÖNETİMİ ==================
  function getCariBakiye(cariId) {
    const borc = cariHareketler.filter((h) => h.cariId === cariId).reduce((s, h) => s + h.toplam, 0);
    const odenen = cariOdemeler.filter((o) => o.cariId === cariId).reduce((s, o) => s + o.tutar, 0);
    return Math.max(0, borc - odenen);
  }

  function getCariSonHareket(cariId) {
    const list = cariHareketler.filter((h) => h.cariId === cariId).sort((a, b) => b.ts - a.ts);
    return list[0] || null;
  }

  function getCariSonOdeme(cariId) {
    const list = cariOdemeler.filter((o) => o.cariId === cariId).sort((a, b) => b.ts - a.ts);
    return list[0] || null;
  }

  function addCari({ tip, ad, telefon, adres, not: notu }) {
    const id = Date.now() + Math.floor(Math.random() * 1000);
    const cari = { id, tip, ad, telefon: telefon || '', adres: adres || '', not: notu || '', aciklama: '', olusturmaTs: Date.now() };
    setCariler((prev) => [...prev, cari]);
    supabase
      .from('cariler')
      .insert({ id, tip, ad, telefon: cari.telefon, adres: cari.adres, kisa_not: cari.not, aciklama: '' })
      .then(({ error }) => { if (error) console.error('cari oluşturulamadı:', error.message); });
    return id;
  }

  function updateCari(id, patch) {
    setCariler((prev) => prev.map((c) => (c.id === id ? { ...c, ...patch } : c)));
    const dbPatch = {};
    if (patch.telefon !== undefined) dbPatch.telefon = patch.telefon;
    if (patch.adres !== undefined) dbPatch.adres = patch.adres;
    if (patch.aciklama !== undefined) dbPatch.aciklama = patch.aciklama;
    if (patch.not !== undefined) dbPatch.kisa_not = patch.not;
    if (patch.ad !== undefined) dbPatch.ad = patch.ad;
    if (Object.keys(dbPatch).length === 0) return;
    supabase.from('cariler').update(dbPatch).eq('id', id).then(({ error }) => {
      if (error) console.error('cari güncellenemedi:', error.message);
    });
  }

  // Bir siparişi (Masalar/Hızlı Satış'tan) bir cariye hareket olarak işler.
  function addCariHareket(cariId, { urunler, toplam, mutfakNotu }) {
    const id = Date.now() + Math.floor(Math.random() * 1000);
    const ts = Date.now();
    setCariHareketler((prev) => [...prev, { id, cariId, ts, urunler, toplam, mutfakNotu: mutfakNotu || '' }]);
    supabase
      .from('cari_hareketler')
      .insert({ id, cari_id: cariId, ts, urunler, toplam, mutfak_notu: mutfakNotu || '' })
      .then(({ error }) => { if (error) console.error('cari hareketi kaydedilemedi:', error.message); });
    return id;
  }

  function addCariOdeme(cariId, { tutar, tur }) {
    const id = Date.now() + Math.floor(Math.random() * 1000);
    const ts = Date.now();
    setCariOdemeler((prev) => [...prev, { id, cariId, ts, tutar, tur }]);
    supabase
      .from('cari_odemeler')
      .insert({ id, cari_id: cariId, ts, tutar, tur })
      .then(({ error }) => { if (error) console.error('cari ödemesi kaydedilemedi:', error.message); });
    return id;
  }

  // Firma carilerinde: o ana kadarki faturalanmamış bakiyeyi bir faturaya bağlar.
  function addCariFatura(cariId, { tarih, faturaNo, tutar }) {
    const id = Date.now() + Math.floor(Math.random() * 1000);
    const eklenmeTs = Date.now();
    setCariFaturalar((prev) => [...prev, { id, cariId, tarih, faturaNo, tutar, eklenmeTs }]);
    supabase
      .from('cari_faturalar')
      .insert({ id, cari_id: cariId, tarih, fatura_no: faturaNo, tutar, eklenme_ts: eklenmeTs })
      .then(({ error }) => { if (error) console.error('fatura kaydedilemedi:', error.message); });
    return id;
  }

  function getCariFaturalanmamisTutar(cariId) {
    const toplamHareket = cariHareketler.filter((h) => h.cariId === cariId).reduce((s, h) => s + h.toplam, 0);
    const faturalanan = cariFaturalar.filter((f) => f.cariId === cariId).reduce((s, f) => s + f.tutar, 0);
    return Math.max(0, toplamHareket - faturalanan);
  }

  // Bakiye sıfırlanınca geçmişi silmez — tek satırlık özet olarak arşivler, cariyi listeden gizler.
  function archiveCari(cariId) {
    const toplam = cariHareketler.filter((h) => h.cariId === cariId).reduce((s, h) => s + h.toplam, 0);
    const ts = Date.now();
    setCariGecmis((prev) => [...prev, { id: Date.now() + Math.floor(Math.random() * 1000), cariId, ts, toplamTutar: toplam, aciklama: 'Tamamlandı' }]);
    setCariHareketler((prev) => prev.filter((h) => h.cariId !== cariId));
    setCariOdemeler((prev) => prev.filter((o) => o.cariId !== cariId));
    setCariFaturalar((prev) => prev.filter((f) => f.cariId !== cariId));

    supabase.from('cari_gecmis').insert({ cari_id: cariId, ts, toplam_tutar: toplam, aciklama: 'Tamamlandı' }).then(({ error }) => {
      if (error) console.error('cari arşivlenemedi:', error.message);
    });
    supabase.from('cari_hareketler').delete().eq('cari_id', cariId).then(({ error }) => { if (error) console.error(error.message); });
    supabase.from('cari_odemeler').delete().eq('cari_id', cariId).then(({ error }) => { if (error) console.error(error.message); });
    supabase.from('cari_faturalar').delete().eq('cari_id', cariId).then(({ error }) => { if (error) console.error(error.message); });
  }

  return {
    products,
    setProducts,
    toggleProductStatus,
    bulkSetCategoryStatus,
    addProduct,
    updateProduct,
    deleteProduct,
    setAzPorsiyon,
    categories,
    setCategories,
    addCategory,
    updateCategoryMeta,
    subcategories,
    setSubcategories,
    addSubcategory,
    updateSubcategoryMeta,
    favorites,
    toggleFavorite,
    allTables,
    packages,
    openPackage,
    orders,
    setOrders,
    updateOrder,
    tableNotes,
    setTableNotes,
    updateTableNote,
    tableDiscounts,
    setTableDiscounts,
    tableOpenedAt,
    salesHistory,
    setSalesHistory,
    soldItems,
    logSoldItems,
    getTableTotal,
    actionHistory,
    undoLastAction,
    transferTable,
    mergeTable,
    closeTableWithPayment,
    writeReceiptToSheets,
    announceViewingTable,
    clearViewingTable,
    isTableOccupiedElsewhere,
    presenceMap,
    cariler,
    cariHareketler,
    cariOdemeler,
    cariFaturalar,
    cariGecmis,
    getCariBakiye,
    getCariSonHareket,
    getCariSonOdeme,
    addCari,
    updateCari,
    addCariHareket,
    addCariOdeme,
    addCariFatura,
    getCariFaturalanmamisTutar,
    archiveCari,
  };
}