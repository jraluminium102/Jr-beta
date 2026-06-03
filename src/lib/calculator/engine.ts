/**
 * JR Aluminium Calculator Engine — R3.9
 * Port จาก JR_คิดราคา_R3.9_UX.html (บรรทัด 310-1362)
 * ห้ามแก้ตัวเลข/สูตร โดยไม่ตรวจกับต้นฉบับ
 */

// ============ RATES (rate tables ทั้งหมด) ============
export const RATES: Record<string, [number, number, number][]> = {
  SMS: [[2.0,2.3,6500],[2.3,3.5,6000],[3.5,4.5,5700],[4.5,5.0,5000],[5.0,7.0,4700],[7.0,9.0,4400],[9.0,12,4200],[12,9999,4000]],
  EURO: [[2.0,2.3,7200],[2.3,3.5,6600],[3.5,4.5,6300],[4.5,5.0,5500],[5.0,7.0,5200],[7.0,9.0,4900],[9.0,12,4700],[12,9999,4400]],
  FIX: [[0.5,1.0,8000],[1.0,1.5,7500],[1.5,2.0,7000],[2.0,2.5,6500],[2.5,3.0,6000],[3.0,3.5,5000],[3.5,9999,5000]],
  AWN: [[0.6,0.8,18000],[0.8,1.1,14400],[1.1,1.3,12000],[1.3,1.6,10800],[1.6,2.0,9600],[2.0,2.5,8400],[2.5,2.9,7800],[2.9,5.5,7200],[5.5,6.0,6600],[6.0,9999,6300]],
  OPEN: [[2.0,2.4,7500],[2.4,3.0,7000],[3.0,3.5,7000],[3.5,4.0,6500],[4.0,5.0,6000],[5.0,6.0,5500],[6.0,9999,5000]],
  ESERIES: [[2.0,2.3,7000],[2.3,3.5,6400],[3.5,4.5,6100],[4.5,5.0,5400],[5.0,7.0,5100],[7.0,9.0,4700],[9.0,12,4500],[12,13.5,4400],[13.5,9999,4200]],
  DSERIES: [[2.0,2.4,9500],[2.4,3.0,9000],[3.0,3.5,8500],[3.5,4.0,8000],[4.0,5.0,7500],[5.0,6.0,7000],[6.0,9999,6500]],
  XOPEN: [[2.0,2.2,12500],[2.2,2.5,11500],[2.5,2.8,10700],[2.8,3.2,9800],[3.2,4.0,9500],[4.0,4.5,9000],[4.5,5.0,8300],[5.0,5.5,7700],[5.5,6.0,7200],[6.0,9999,6800]],
  VELORA: [[2.0,2.4,8000],[2.4,3.0,7500],[3.0,3.5,7500],[3.5,4.0,7000],[4.0,5.0,6500],[5.0,6.0,6000],[6.0,9999,5500]],
  SHOWER: [[2.4,3.0,5500],[3.0,3.5,5300],[3.5,4.0,5200],[4.0,9999,5100]],
  FRAMELESS: [[1,2,7200],[2,3,6800],[3,4,6400],[4,5,6000],[5,6,5600],[6,7,5200],[7,8,4800],[8,9999,4500]],
  CURVE_DBL: [[4.0,5.0,12000],[5.0,6.0,11500],[6.0,9999,11000]],
  CURVE_SGL: [[2.3,2.5,14000],[2.5,9999,13500]],
  CURVE_FIX: [[1.8,2.0,6500],[2.0,2.5,6000],[2.5,3.0,5500],[3.0,4.0,5000],[4.0,5.0,4500],[5.0,9999,4000]],
  CURVE_SLIM: [[2.5,2.8,20000],[2.8,9999,19000]],
  PC2: [[3.0,3.5,11000],[3.5,4.0,10000],[4.0,4.5,9500],[4.5,5.0,9200],[5.0,9999,9000]],
  PC4: [[4.0,4.5,11500],[4.5,5.0,11000],[5.0,6.0,10500],[6.0,7.0,10000],[7.0,8.0,9500],[8.0,9.0,9000],[9.0,9999,8500]],
  INTOP: [[4.0,4.5,4800],[4.5,5.0,4500],[5.0,5.5,4200],[5.5,6.0,3900],[6.0,9999,3700]],
  SLIMLUX: [[4.0,4.5,7500],[4.5,5.0,7200],[5.0,5.5,6700],[5.5,7.0,6300],[7.0,9.0,6000],[9.0,9999,5600]],
  INBOT_SMS: [[4.0,5.0,3800],[5.0,5.5,3500],[5.5,8.0,3200],[8.0,11,2900],[11,9999,2600]],
  INBOT_EURO: [[4.0,5.0,4200],[5.0,5.5,3900],[5.5,8.0,3600],[8.0,11,3200],[11,9999,2900]],
  PIVOT: [[2.0,2.5,14000],[2.5,3.0,13000],[3.0,3.5,12000],[3.5,4.0,11000],[4.0,4.5,10000],[4.5,9999,9000]],
  BEAM: [[3.5,8.0,1300],[8.0,10,1100],[10,12,900],[12,9999,800]],
  ROOF_STD: [[5,10,6500],[10,15,6000],[15,30,5500],[30,9999,5000]],
  ROOF_POLY: [[5,10,7500],[10,15,6500],[15,30,6000],[30,9999,5700]],
  ROOF_LAM: [[5,10,11000],[10,15,10500],[15,9999,10000]],
  ROOF_SLIDE: [[5,10,5000],[10,15,4700],[15,20,4400],[20,25,4100],[25,30,3800],[30,9999,3500]],
  ISOWALL: [[1.0,1.5,7000],[1.5,2.0,6500],[2.0,2.5,6000],[2.5,3.0,5500],[3.0,3.5,5000],[3.5,9999,4500]],
  WALL_EXT: [[3.0,4.5,4500],[4.5,6.0,4200],[6.0,7.5,3900],[7.5,9999,3600]],
  WALL_INT: [[3.0,4.5,4100],[4.5,6.0,3800],[6.0,7.5,3500],[7.5,9999,3200]],
  CEILING: [[10,20,1200],[20,9999,1150]],
  IMP1: [[0.0,5.0,10700],[5.0,10.0,10000],[10.0,15.0,9700],[15.0,9999,9400]],
  IMP2: [[0.0,5.0,9700],[5.0,10.0,9000],[10.0,15.0,8700],[15.0,9999,8400]],
  IMP3: [[0.0,5.0,9700],[5.0,10.0,9000],[10.0,15.0,8700],[15.0,9999,8400]],
  IMP4: [[0.0,5.0,9700],[5.0,10.0,9000],[10.0,15.0,8700],[15.0,9999,8400]],
  IMP5: [[0.0,5.0,7900],[5.0,10.0,7200],[10.0,15.0,7000],[15.0,9999,6700]],
  IMP6: [[0.0,5.0,8700],[5.0,10.0,8000],[10.0,15.0,7700],[15.0,9999,7400]],
  IMP7: [[0.0,10.0,6300],[10.0,15.0,5800],[15.0,30.0,5300],[30.0,9999,4800]],
  IMP8: [[0.0,10.0,6400],[10.0,15.0,5900],[15.0,30.0,5400],[30.0,9999,4900]],
  IMP9: [[0.0,10.0,6600],[10.0,15.0,6100],[15.0,30.0,5600],[30.0,9999,5100]],
  IMP10: [[0.0,10.0,6700],[10.0,15.0,6200],[15.0,30.0,5700],[30.0,9999,5200]],
  IMP11: [[0.0,10.0,6300],[10.0,15.0,5800],[15.0,30.0,5300],[30.0,9999,4800]],
  IMP12: [[0.0,10.0,6600],[10.0,15.0,6100],[15.0,30.0,5600],[30.0,9999,5100]],
  IMP13: [[0.0,10.0,7300],[10.0,15.0,6800],[15.0,30.0,6300],[30.0,9999,5800]],
  IMP14: [[0.0,10.0,7500],[10.0,15.0,7000],[15.0,30.0,6500],[30.0,9999,6000]],
  IMP15: [[0.0,10.0,11000],[10.0,15.0,10500],[15.0,9999,10000]],
  IMP16: [[0.0,10.0,10600],[10.0,15.0,10000],[15.0,9999,9600]],
  IMP17: [[0.0,10.0,10800],[10.0,15.0,10200],[15.0,9999,9800]],
  IMP18: [[0.0,10.0,10100],[10.0,15.0,9500],[15.0,9999,9100]],
  IMP19: [[0.0,10.0,14000],[10.0,15.0,13500],[15.0,9999,13000]],
  IMP20: [[0.0,10.0,12600],[10.0,15.0,12000],[15.0,9999,11600]],
  IMP21: [[0.0,1.5,2200],[1.5,2.5,1700],[2.5,9999,1500]],
  IMP22: [[0.0,1.5,1200],[1.5,2.5,1000],[2.5,9999,850]],
  IMP23: [[0.0,1.5,4500],[1.5,3.0,3700],[3.0,9999,3500]],
  IMP24: [[0.0,9999,2500]],
  IMP25: [[0.0,9999,2900]],
  IMP26: [[0.0,9999,3000]],
  IMP27: [[0.0,9999,3500]],
  IMP28: [[1.0,9999,4500]],
  IMP29: [[1.0,9999,3000]],
  IMP30: [[1.0,9999,1500]],
  IMP31: [[0.0,1.5,3500],[1.5,3.0,3200],[3.0,9999,3000]],
  IMP32: [[0.01,9999,5000]],
  IMP33: [[0.01,9999,800]],
  IMP34: [[0.01,9999,2500]],
  IMP35: [[0.01,9999,1200]],
  EXHIDO: [[0.0,4.0,30000],[4.0,9999,20000]],
  MJ_BLACKOUT: [[0.01,9999,2500]],
  MJ_SD_TWOWAY: [[0.01,9999,4000]],
  MJ_KEEPRAIL_TWOWAY: [[0.01,9999,6000]],
  MJ_KEEPRAIL_HONEY: [[0.01,9999,4500]],
  MJ_SD_BASIC: [[0.01,9999,2500]],
  MJ_SD_SAHARA: [[0.01,9999,3200]],
  MJ_SCREEN_SAFETY: [[0.01,9999,5000]],
  MJ_KICK_150: [[0.01,9999,7500]],
  MJ_KICK_300: [[0.01,9999,7500]],
  MJ_KICK_600: [[0.01,9999,7500]],
};

// ============ COSTS (ตารางต้นทุน — interpolation) ============
export const COSTS: Record<string, [number, number][]> = {
  sliding_sms: [[0.45,5835],[1.8,8652],[2.7,10248],[2.7,10500],[3.24,11948],[4.05,12579],[4.14,12799],[4.86,14517],[4.86,13826],[5.85,16500],[6.21,15904],[7.02,17320],[7.29,18007],[8.1,19303],[8.97,20043],[10.53,22662],[11.04,23147],[11.7,24345],[12.96,26153],[14.4,28126],[16.2,30658],[18,33167]],
  sliding_euro: [[2.25,15142],[6,26714],[8.4,24076],[11.2,34608],[18,36022],[18,41923]],
  casement_euro: [[1.08,9404],[1.6,9773],[2,12485],[2.16,13811],[2.88,13167],[3.2,14684],[3.64,14801],[4.2,17618],[4.4,15666],[4.5,17830],[5.76,20078],[6.72,20897],[7.28,21283],[8.4,22150],[9,22574]],
  awning_euro: [[0.16,7597],[0.32,7755],[0.32,8296],[0.6,7934],[0.6,7979],[0.64,8536],[1.08,8331],[1.2,8878],[1.2,10735],[1.27,8464],[1.7,8811],[2.16,11438],[2.55,11705],[3.4,12329]],
  lift_sms: [[0.5,12690],[0.5,12860],[1.6,14270],[1.6,13790],[2.2,14530],[2.2,13970]],
  roof_vinyl: [[4.5,18808],[9,34414],[13.5,50500],[18,67445],[24,89344],[30,111353]],
  roof_delight: [[4.5,18104],[9,33004],[13.5,48384],[18,59975],[24,74734],[30,94253]],
};

// ============ GLASS ============
export const GBC = 264; // ทุนกระจกฐาน เขียว/ใส 6มม.

export interface GlassItem {
  n: string;
  c: number; // ต้นทุน/ตร.ม.
  s: number; // ราคาขาย uplift /ตร.ม. (0 = default ไม่บวก)
}

export const GLASS: GlassItem[] = [
  {n:"กระจกเขียว 6 มม.",c:264,s:0},
  {n:"กระจกใส 6 มม.",c:264,s:0},
  {n:"กระจกเขียว/ใส 8 มม.",c:646,s:1200},{n:"กระจกเขียว/ใส 10 มม.",c:754,s:1200},
  {n:"กระจกเคลือบขาว 6 มม.",c:915,s:1800},{n:"ยูโรเกรย์ 6 มม. (Perane)",c:517,s:800},
  {n:"ยูโรเกรย์ 8 มม. (Perane)",c:915,s:1500},{n:"ยูโรเกรย์ 10 มม. (Perane)",c:1023,s:1700},
  {n:"ยูโรบรอนซ์ 6 มม. (Perane)",c:571,s:1000},{n:"ยูโรบรอนซ์ 10 มม. (BSG)",c:3917,s:6400},
  {n:"reflective สีเทา 6 มม. (CS120/130/150)",c:1216,s:2100},{n:"reflective สีเขียว 6 มม. (CS214)",c:1388,s:2400},
  {n:"reflective สีฟ้า/เทาใหม่ 6 มม. (CS514/140/148)",c:1517,s:2700},{n:"เทมเปอร์เขียว/ใส 6 มม.",c:439,s:600},
  {n:"เทมเปอร์เขียว/ใส 10 มม.",c:1023,s:2100},{n:"เทมเปอร์เขียว/ใส 12 มม.",c:1159,s:2400},
  {n:"เทมเปอร์เขียว/ใส 15 มม.",c:3121,s:5000},{n:"เทมเปอร์ใสพิเศษ 6 มม.",c:1432,s:2500},
  {n:"เทมเปอร์ใสพิเศษ 10 มม.",c:3497,s:5700},{n:"เทมเปอร์ฝ้า 6 มม.",c:1076,s:2200},
  {n:"เทมเปอร์ฝ้า 8 มม.",c:1937,s:3500},{n:"เทมเปอร์ยูโรเกรย์ 4 มม. (ISG)",c:824,s:1300},
  {n:"เทมเปอร์ยูโรเกรย์ 5 มม. (ISG)",c:1006,s:1700},{n:"เทมเปอร์ยูโรเกรย์ 6 มม. (ISG)",c:1033,s:2100},
  {n:"เทมเปอร์ยูโรเกรย์ 10 มม. (BSG)",c:2637,s:4200},{n:"เทมเปอร์ยูโรบรอนซ์ 5 มม. (ISG)",c:1184,s:2000},
  {n:"เทมเปอร์ยูโรบรอนซ์ 6 มม. (ISG)",c:1291,s:2800},{n:"เทมเปอร์ยูโรบรอนซ์ 10 มม. (BSG)",c:4670,s:5900},
  {n:"เทมเปอร์ reflective สีเทา 6 มม.",c:1937,s:3500},{n:"เทมเปอร์ reflective สีเขียว 6 มม. (CS214)",c:2196,s:4000},
  {n:"เทมเปอร์ reflective สีฟ้า 6 มม. (CS514)",c:2368,s:4400},{n:"ลามิเนต 4+4 มม. ฟิล์มเขียว/ใส 0.38",c:1065,s:2200},
  {n:"ลามิเนต 5+5 มม. ฟิล์มเขียว/ใส 0.38",c:1270,s:2700},{n:"ลามิเนตใส 4+4 มม. ฟิล์มสีต่างๆ 0.38",c:2636,s:4200},
  {n:"ลามิเนต 4+4 มม. ฟิล์มกันเสียง 0.76",c:3314,s:5300},{n:"ลามิเนต 4+4 มม. Solar Max (กันร้อน) 0.76",c:2679,s:4300},
  {n:"ลามิเนต 4+4 มม. กันขโมย STG 1.52",c:4412,s:5500},{n:"อินซูเลทเขียว/ใส 6+6+6 มม.",c:2195,s:4000},
  {n:"กระจกชาดำ/ฝ้า/ลายผ้า 5-6 มม.",c:400,s:500},{n:"กระจกเงา 5 มม.",c:600,s:1000},{n:"กระจกลอนแก้ว 5 มม.",c:700,s:1300},
  {n:"★ กระจกเทมเปอร์ 8 มม.",c:820,s:1300},
  {n:"★ กระจกเทมเปอร์สีชาดำ 6 มม.",c:1100,s:1800},
  {n:"★ กระจกเทมเปอร์สีชาดำ 10 มม.",c:1700,s:3000},
  {n:"★ กระจกเทมเปอร์สีฟ้า 6 มม.",c:900,s:1400},
  {n:"★ กระจกเทมเปอร์ใสพิเศษ 8 มม.",c:2200,s:4000},
  {n:"★ กระจกลามิเนต 6+6 มม. ฟิล์ม 0.38",c:1400,s:2400},
  {n:"★ กระจกลามิเนต 4+4 มม. (สูง>2.5ม.) ฟิล์ม 0.76",c:1300,s:2200},
  {n:"★ กระจกลามิเนต 5+5 มม. (สูง>2.5ม.) ฟิล์ม 0.76",c:1350,s:2300},
  {n:"★ กระจกลามิเนต 6+6 มม. (สูง>2.5ม.) ฟิล์ม 0.76",c:1600,s:2800},
  {n:"★ กระจกลามิเนตยูโรเกรย์+ใส 6+6",c:1700,s:3000},
  {n:"★ กระจกลามิเนตยูโรเกรย์+ยูโรเกรย์ 6+6",c:2000,s:3600},
  {n:"★ กระจกลามิเนตสีชาดำ+ใส 6+6",c:1700,s:3000},
  {n:"★ กระจกลามิเนตสีชาดำ+สีชาดำ 6+6",c:2000,s:3600},
  {n:"★ กระจกลามิเนตคริสตัลเกรย์+ใส 6+6",c:1700,s:3000},
  {n:"★ กระจกลามิเนตคริสตัลเกรย์+คริสตัลเกรย์ 6+6",c:2000,s:3600},
  {n:"★ กระจกลามิเนตสีฟ้า+สีใส 6+6",c:1600,s:2800},
  {n:"★ กระจกลามิเนตสีฟ้า+สีฟ้า 6+6",c:1900,s:3400},
  {n:"★ กระจกลามิเนตยูโรบรอนซ์+ใส 6+6",c:1600,s:2800},
  {n:"★ กระจกลามิเนตยูโรบรอนซ์+ยูโรบรอนซ์ 6+6",c:1900,s:3400},
  {n:"★ กระจกใสดัดโค้งหนา 10 มม.",c:6750,s:8550},
  {n:"★ กระจกใสดัดโค้งลามิเนตใส 5+5 มม.",c:8750,s:11150},
  {n:"★ กระจกลามิเนต 4+4 ยูโรเกรย์",c:1700,s:3000},
  {n:"★ กระจกเงาทอง",c:700,s:1000},
  {n:"★ กระจกลามิเนตลอนแก้ว/กระจกเงาทอง 4+4",c:2000,s:3600},
  {n:"★ กระจกเทมเปอร์ลามิเนต 6+6 Pvb 1.52",c:3000,s:4800},
];

// ============ COLORS ============
export interface ColorItem {
  n: string;
  quoteName?: string;
  min: number;
  rates: [number, number, number][] | null;
  series: string;
  altFor?: string;
  altRates?: [number, number, number][];
  altMin?: number;
  hasCode?: number;
  sampleConfirm?: number;
  note?: string;
}

export const COLORS: ColorItem[] = [
  {n:'สีอบขาว',min:0,rates:null,series:'MLS'},
  {n:'สีดำ',min:0,rates:null,series:'MLS'},
  {n:'สีเทาซาฮารา',min:0,rates:[[5,20,540],[20,30,520],[30,40,480],[40,9999,440]],series:'MLS'},
  {n:'สีดำซาฮารา',min:0,rates:[[5,20,540],[20,30,520],[30,40,480],[40,9999,440]],series:'MLS'},
  {n:'สี Aztec gray',min:4000,rates:[[7,10,700],[10,20,650],[20,9999,600]],series:'L',altFor:'MS',altRates:[[7,10,2200],[10,15,2100],[15,20,1800],[20,9999,1600]],altMin:10000,note:'L=stock · M/S=อบพิเศษ'},
  {n:'สีลายไม้สต๊อก (สักทอง) ★',quoteName:'สีลายไม้สต๊อก สักทอง',min:4000,rates:[[7,10,850],[10,9999,750]],series:'MLS',altFor:'S',altRates:[[7,10,2100],[10,15,1900],[15,20,1700],[20,9999,1600]],altMin:11000},
  {n:'สีลายไม้สต๊อก (มะฮอกกานี) ⚠',quoteName:'สีลายไม้สต๊อก มะฮอกกานี',min:4000,rates:[[7,10,850],[10,9999,750]],series:'MLS',altFor:'MS',altRates:[[7,10,2100],[10,15,1900],[15,20,1700],[20,9999,1600]],altMin:11000},
  {n:'สีลายไม้สต๊อก (ไวท์โอ๊ค) ⚠',quoteName:'สีลายไม้สต๊อก ไวท์โอ๊ค',min:4000,rates:[[7,10,850],[10,9999,750]],series:'MLS',altFor:'MS',altRates:[[7,10,2100],[10,15,1900],[15,20,1700],[20,9999,1600]],altMin:11000},
  {n:'สีลายไม้อบพิเศษจาก Fuji - Oak (โอ๊ค)',min:11000,rates:[[7,10,2100],[10,15,1900],[15,20,1700],[20,9999,1600]],series:'MLS'},
  {n:'สีลายไม้อบพิเศษจาก Fuji - Makha (มะค่า)',min:11000,rates:[[7,10,2100],[10,15,1900],[15,20,1700],[20,9999,1600]],series:'MLS'},
  {n:'สีอบพิเศษ',min:10000,rates:[[7,10,2200],[10,15,2100],[15,20,1800],[20,9999,1600]],series:'MLS',hasCode:1},
  {n:'สีลายไม้อบพิเศษ',min:15000,rates:[[7,10,2900],[10,15,2600],[15,20,2350],[20,9999,2200]],series:'MLS',hasCode:1},
  {n:'สีชุบ',min:16000,rates:null,series:'MLS',hasCode:1,sampleConfirm:1,note:'ลูกค้าต้องเห็นตัวอย่างจริง+ถ่ายรูปยืนยัน'},
];

// ============ PRODUCTS ============
export interface ProductDef {
  id: string;
  cat: string;
  name: string;
  method?: string;
  min?: number;
  rates?: string;
  cost?: string | null;
  ref?: string;
  digihandle?: number;
  series?: string;
  mosquito?: number;
  addon?: { kind: string; extra?: number; amounts?: Record<number, number> };
  closer?: number;
  optBeam?: boolean;
  optSlide?: boolean;
  optInsul?: boolean;
  motor?: boolean;
  maxPanels?: number;
  unit_rate?: number;
  per_panel_min?: number;
  per_panel?: number;
  unit?: string;
  rate?: number;
  ranae?: number;
  prod?: number;
  fin?: Record<string, number>;
  cabinet?: number;
  future_tech?: number;
  bar_grid?: number;
  bar_slide?: number;
  bar_openclose?: number;
  fence_gate?: number;
  gate?: number;
  grid?: number;
  ceiling?: number;
  crates?: Record<string, number>;
  handrail?: number;
  pvc_cover?: number;
  screen_addon?: number;
  mscolor?: boolean;
  frame_wrap?: string;
  custom_price?: number;
  solid_door?: number;
  full_grid?: number;
  sizeCheck?: string;
  glasshouse?: number;
  glass_replace?: number;
  color_addon?: string;
  hide_slope?: string;
  custom_item?: number;
  g?: number;
  truss_cover?: number;
  gutter_cover?: number;
  gutter_dim?: number[];
  deny_with?: string[];
  allow_with?: string[];
  min_door?: number;
  min_window?: number;
}

export const PRODUCTS: ProductDef[] = [
  {id:'sliding_sms',cat:'บานเลื่อน',name:'บานเลื่อน เซมิยูโร',method:'bucket',min:6500,rates:'SMS',cost:'sliding_sms',digihandle:1,series:'M',mosquito:1},
  {id:'sliding_euro',cat:'บานเลื่อน',name:'บานเลื่อน ยูโร',method:'bucket',min:7500,rates:'EURO',cost:'sliding_euro',digihandle:1,series:'L',mosquito:1},
  {id:'sliding_eseries',cat:'บานเลื่อน',name:'บานเลื่อน E-series (aluinch)',method:'bucket',min:12000,rates:'ESERIES',cost:null,mosquito:1},
  {id:'fixed_glass',cat:'ติดตาย',name:'กระจกติดตาย',method:'bucket',min:5000,rates:'FIX',cost:null},
  {id:'awning_euro',cat:'บานกระทุ้ง',name:'บานกระทุ้ง ยูโร',method:'bucket',min:10000,rates:'AWN',cost:'awning_euro',addon:{kind:'window',extra:2900},series:'L',mosquito:1},
  {id:'awning_aluinch',cat:'บานกระทุ้ง',name:'บานกระทุ้ง aluinch',method:'same_as',ref:'awning_euro',cost:null,mosquito:1},
  {id:'casement_euro',cat:'บานเปิด',name:'บานเปิด ยูโร',method:'bucket',min:18000,rates:'OPEN',cost:'casement_euro',addon:{kind:'door',extra:14000},closer:1,digihandle:1,series:'L',mosquito:1},
  {id:'casement_dseries',cat:'บานเปิด',name:'บานเปิด D-series',method:'bucket',min:24000,rates:'DSERIES',cost:null,addon:{kind:'door',extra:19000},mosquito:1},
  {id:'casement_xseries',cat:'บานเปิด',name:'บานเปิด X-series',method:'bucket',min:28000,rates:'XOPEN',cost:null,addon:{kind:'door',extra:5000},mosquito:1},
  {id:'casement_velora',cat:'บานเปิด',name:'บานเปิด Velora (รวมเทมเปอร์6มม.)',method:'bucket',min:19000,rates:'VELORA',cost:null,addon:{kind:'door',extra:15000},mosquito:1},
  {id:'casement_flush_solid',cat:'บานเปิด',name:'ประตูบานเปิด โซลิด ทู',method:'bucket',min:0,rates:'OPEN',cost:null,addon:{kind:'door',extra:0},closer:1,digihandle:1,series:'L',mosquito:1,custom_price:1,solid_door:1,full_grid:1},
  {id:'casement_inset_solid',cat:'บานเปิด',name:'ประตูบานเปิด โซลิด วัน',method:'bucket',min:0,rates:'OPEN',cost:null,addon:{kind:'door',extra:0},closer:1,digihandle:1,series:'L',mosquito:1,custom_price:1,solid_door:1,full_grid:1},
  {id:'pivot',cat:'บานหมุน',name:'บานหมุนเมืองทอง',method:'bucket',min:26000,rates:'PIVOT',cost:null,addon:{kind:'window',extra:5000}},
  {id:'pivot_aluinch',cat:'บานหมุน',name:'บานหมุน aluinch',method:'same_as',ref:'pivot',cost:null},
  {id:'folding',cat:'บานเฟี้ยม',name:'บานเฟี้ยม เซมิยูโร',method:'fold',unit_rate:9000,per_panel_min:15000,cost:null,optBeam:true,series:'M',mosquito:1},
  {id:'folding_xseries',cat:'บานเฟี้ยม',name:'บานเฟี้ยม X-series',method:'fold_flat',min:36000,unit_rate:12000,cost:null,optBeam:true,mosquito:1},
  {id:'inner_top_stack',cat:'เลื่อนภายใน',name:'เลื่อนภายในรางบน (ซ้อน)',method:'area_rate_addon',rates:'INTOP',cost:null,addon:{kind:'sliding',amounts:{1:4000,2:10000,3:16000,4:22000}}},
  {id:'inner_top_slimlux',cat:'เลื่อนภายใน',name:'เลื่อนภายในรางบน SlimLux',method:'area_rate_addon',rates:'SLIMLUX',cost:null,addon:{kind:'sliding',amounts:{1:4000,2:10000,3:20000,4:28000}}},
  {id:'inner_top_xseries',cat:'เลื่อนภายใน',name:'เลื่อนภายในรางบน X-series',method:'area_rate_addon',rates:'SLIMLUX',cost:null,addon:{kind:'sliding',amounts:{1:4000,2:10000,3:20000,4:28000}}},
  {id:'inner_bottom_sms',cat:'เลื่อนภายใน',name:'เลื่อนภายในรางล่าง SMS',method:'area_rate_addon',rates:'INBOT_SMS',cost:null,addon:{kind:'sliding',amounts:{1:4000,2:10000,3:16000,4:22000}}},
  {id:'inner_bottom_euro',cat:'เลื่อนภายใน',name:'เลื่อนภายในรางล่าง ยูโร',method:'area_rate_addon',rates:'INBOT_EURO',cost:null,addon:{kind:'sliding',amounts:{1:4400,2:11000,3:17600,4:24200}}},
  {id:'lift_sms',cat:'บานยก',name:'บานยก SMS',method:'lift',cost:'lift_sms',maxPanels:2,motor:true,mosquito:1},
  {id:'lift_aluinch',cat:'บานยก',name:'บานยก aluinch',method:'same_as',ref:'lift_sms',cost:null,motor:true,mosquito:1},
  {id:'shower',cat:'shower',name:'shower กั้นห้องอาบน้ำ',method:'bucket',min:12000,rates:'SHOWER',cost:null},
  {id:'frameless_fixed',cat:'บานเปลือย',name:'บานเปลือยติดตาย',method:'bucket',min:7000,rates:'FRAMELESS',cost:null},
  {id:'frameless_door',cat:'บานเปลือย',name:'ประตูสวิง/เลื่อน บานเปลือย',method:'ref_plus_panel',ref:'frameless_fixed',per_panel:8000,cost:null},
  {id:'curved_double',cat:'ดัดโค้ง',name:'ประตูดัดโค้งบานคู่',method:'bucket',min:47000,rates:'CURVE_DBL',cost:null,digihandle:1},
  {id:'curved_single',cat:'ดัดโค้ง',name:'ประตูดัดโค้งบานเดี่ยว',method:'bucket',min:32000,rates:'CURVE_SGL',cost:null,digihandle:1},
  {id:'curved_fixed',cat:'ดัดโค้ง',name:'บานติดตายดัดโค้ง',method:'bucket',min:10000,rates:'CURVE_FIX',cost:null},
  {id:'curved_slim',cat:'ดัดโค้ง',name:'บานดัดโค้งสลิม',method:'bucket',min:50000,rates:'CURVE_SLIM',cost:null,digihandle:1},
  {id:'pc_door_2',cat:'PC Door',name:'PC Door 2 บาน',method:'bucket',min:36000,rates:'PC2',cost:null,mosquito:1},
  {id:'pc_door_4',cat:'PC Door',name:'PC Door 4 บาน',method:'area_rate',rates:'PC4',min:46000,cost:null,mosquito:1},
  {id:'roof_vinyl',cat:'หลังคา',name:'หลังคา ไวนิล',method:'bucket',min:28000,rates:'ROOF_STD',cost:'roof_vinyl',optSlide:true},
  {id:'roof_delight',cat:'หลังคา',name:'หลังคา ดีไลท์',method:'bucket',min:28000,rates:'ROOF_STD',cost:'roof_delight',optSlide:true},
  {id:'roof_polyton',cat:'หลังคา',name:'หลังคา โพลีตัน 3มม.',method:'bucket',min:30000,rates:'ROOF_POLY',cost:null,optSlide:true},
  {id:'roof_laminate',cat:'หลังคา',name:'หลังคา กระจกลามิเนต',method:'bucket',min:45000,rates:'ROOF_LAM',cost:null,optSlide:true},
  {id:'ceiling_smooth',cat:'ฝ้า-ผนัง',name:'ฝ้าฉาบเรียบ',method:'bucket',min:12000,rates:'CEILING',cost:null,optInsul:true},
  {id:'isowall',cat:'ฝ้า-ผนัง',name:'ISOWALL',method:'bucket',min:7000,rates:'ISOWALL',cost:null},
  {id:'wall_ext',cat:'ฝ้า-ผนัง',name:'ผนังเบาภายนอก',method:'bucket',min:13500,rates:'WALL_EXT',cost:null},
  {id:'wall_int',cat:'ฝ้า-ผนัง',name:'ผนังเบาภายใน',method:'bucket',min:13500,rates:'WALL_INT',cost:null},
  {id:'imp1',cat:'ราวบันได',name:'ราวกันตก 47.1 บันไดเฉียง หมุดแปะปูน',method:'per_length_tier',rates:'IMP1',handrail:1,cost:null},
  {id:'imp2',cat:'ราวบันได',name:'ราวกันตก 47.2 บันไดเฉียง U/เสาอลู',method:'per_length_tier',rates:'IMP2',handrail:1,cost:null},
  {id:'imp3',cat:'ราวบันได',name:'ราวกันตก 47.2 บันไดเฉียง เสาอลู',method:'per_length_tier',rates:'IMP3',handrail:1,cost:null},
  {id:'imp4',cat:'ราวบันได',name:'ราวกันตก 47.3 บันไดตรง หมุดแปะปูน',method:'per_length_tier',rates:'IMP4',handrail:1,cost:null},
  {id:'imp5',cat:'ราวบันได',name:'ราวกันตก 47.4 บันไดตรง U/เสาอลู',method:'per_length_tier',rates:'IMP5',handrail:1,cost:null},
  {id:'imp6',cat:'ราวบันได',name:'ราวกันตก 47.4 บันไดตรง เสาอลู',method:'per_length_tier',rates:'IMP6',handrail:1,cost:null},
  {id:'imp7',cat:'หลังคา',name:'เมทัลชีท 1 นิ้ว ท้องPVC EPS',method:'bucket',min:0,rates:'IMP7',cost:null},
  {id:'imp8',cat:'หลังคา',name:'เมทัลชีท 2 นิ้ว ท้องPVC EPS',method:'bucket',min:0,rates:'IMP8',cost:null},
  {id:'imp9',cat:'หลังคา',name:'เมทัลชีท 1 นิ้ว ท้องเหล็ก EPS',method:'bucket',min:0,rates:'IMP9',cost:null},
  {id:'imp10',cat:'หลังคา',name:'เมทัลชีท 2 นิ้ว ท้องเหล็ก EPS',method:'bucket',min:0,rates:'IMP10',cost:null},
  {id:'imp11',cat:'หลังคา',name:'เมทัลชีท 1 นิ้ว ท้องฟอยล์ PU',method:'bucket',min:0,rates:'IMP11',cost:null},
  {id:'imp12',cat:'หลังคา',name:'เมทัลชีท 2 นิ้ว ท้องฟอยล์ PU',method:'bucket',min:0,rates:'IMP12',cost:null},
  {id:'imp13',cat:'หลังคา',name:'เมทัลชีท 1 นิ้ว ท้องเหล็ก PU',method:'bucket',min:0,rates:'IMP13',cost:null},
  {id:'imp14',cat:'หลังคา',name:'เมทัลชีท 2 นิ้ว ท้องเหล็ก PU',method:'bucket',min:0,rates:'IMP14',cost:null},
  {id:'imp15',cat:'หลังคา',name:'ชินโคไลท์ 6 มม. รุ่น Heat Cut',method:'bucket',min:0,rates:'IMP15',cost:null},
  {id:'imp16',cat:'หลังคา',name:'ชินโคไลท์ 6 มม. รุ่น Superior',method:'bucket',min:0,rates:'IMP16',cost:null},
  {id:'imp17',cat:'หลังคา',name:'ชินโคไลท์ 6 มม. รุ่น Nature',method:'bucket',min:0,rates:'IMP17',cost:null},
  {id:'imp18',cat:'หลังคา',name:'ชินโคไลท์ 4 มม. รุ่น Shade',method:'bucket',min:0,rates:'IMP18',cost:null},
  {id:'imp19',cat:'หลังคา',name:'ชินโคไลท์ 10 มม. รุ่น Prime',method:'bucket',min:0,rates:'IMP19',cost:null},
  {id:'imp20',cat:'หลังคา',name:'ชินโคไลท์ 10 มม. รุ่น Grang',method:'bucket',min:0,rates:'IMP20',cost:null},
  {id:'imp21',cat:'มุ้ง',name:'มุ้งเฟรมเล็ก ผ้ามุ้งไฟเบอร์',method:'bucket',min:0,rates:'IMP21',cost:null,min_door:2400,min_window:1200,screen_addon:1,mscolor:true},
  {id:'imp22',cat:'มุ้ง',name:'มุ้งเฟรมเล็กติดตาย ผ้ามุ้งไฟเบอร์',method:'bucket',min:0,rates:'IMP22',cost:null,min_door:1500,min_window:800,screen_addon:1,mscolor:true},
  {id:'imp23',cat:'มุ้ง',name:'มุ้งเฟรมใหญ่',method:'bucket',min:0,rates:'IMP23',cost:null,min_door:7200,min_window:4800,screen_addon:1,mscolor:true},
  {id:'imp28',cat:'มุ้ง',name:'มุ้งจีบ ตีนตะขาบ ผ้ามุ้งไฟเบอร์',method:'bucket',min:0,rates:'IMP28',cost:null,mscolor:true},
  {id:'imp29',cat:'มุ้ง',name:'มุ้งม้วน ผ้ามุ้งไฟเบอร์',method:'bucket',min:0,rates:'IMP29',cost:null,mscolor:true},
  {id:'imp30',cat:'มุ้ง',name:'มุ้งแม่เหล็ก พับเปิดได้',method:'bucket',min:0,rates:'IMP30',cost:null},
  {id:'imp31',cat:'มุ้ง',name:'มุ้งจีบนิรภัย มุ้งสแตนเลส 0.8มม.',method:'bucket',min:0,rates:'IMP31',cost:null},
  {id:'imp32',cat:'มุ้ง',name:'มุ้งจีบนิรภัย มุ้งสแตนเลส 0.8มม. เสริมวงกบ',method:'bucket',min:0,rates:'IMP32',cost:null},
  {id:'imp33',cat:'มุ้ง',name:'มุ้งกันแมว หมา',method:'bucket',min:0,rates:'IMP33',cost:null},
  {id:'imp35',cat:'มุ้ง',name:'มุ้งสแตนเลส 0.3มม. กันหนู',method:'bucket',min:0,rates:'IMP35',cost:null},
  {id:'mj_blackout',cat:'มุ้ง',name:'มุ้งจีบ Blackout รังผึ้งทึบแสง',method:'bucket',min:3500,rates:'MJ_BLACKOUT',cost:null,mscolor:true},
  {id:'mj_sd_twoway',cat:'มุ้ง',name:'มุ้งจีบ SD + ทูเวย์ ม่านรังผึ้ง',method:'bucket',min:4000,rates:'MJ_SD_TWOWAY',cost:null,mscolor:true},
  {id:'mj_keep_twoway',cat:'มุ้ง',name:'มุ้งจีบ ตีนตะขาบ + ทูเวย์ ม่านรังผึ้ง',method:'bucket',min:6000,rates:'MJ_KEEPRAIL_TWOWAY',cost:null,mscolor:true},
  {id:'mj_keep_honey',cat:'มุ้ง',name:'มุ้งจีบ ตีนตะขาบ + ม่านรังผึ้ง',method:'bucket',min:4500,rates:'MJ_KEEPRAIL_HONEY',cost:null,mscolor:true},
  {id:'mj_kick_150',cat:'มุ้ง',name:'มุ้งม้วนเก็บข้างเตะได้ รุ่น 150',method:'bucket',min:15000,rates:'MJ_KICK_150',cost:null,mscolor:true},
  {id:'mj_kick_300',cat:'มุ้ง',name:'มุ้งม้วนเก็บข้างเตะได้ รุ่น 300',method:'bucket',min:37500,rates:'MJ_KICK_300',cost:null,mscolor:true},
  {id:'mj_kick_600',cat:'มุ้ง',name:'มุ้งม้วนเก็บข้างเตะได้ รุ่น 600',method:'bucket',min:67500,rates:'MJ_KICK_600',cost:null,mscolor:true},
  {id:'mj_sd_basic',cat:'มุ้ง',name:'มุ้งจีบ SD พื้นฐาน',method:'bucket',min:3500,rates:'MJ_SD_BASIC',cost:null,mscolor:true},
  {id:'mj_screen_safety',cat:'มุ้ง',name:'มุ้งจีบนิรภัย',method:'bucket',min:5000,rates:'MJ_SCREEN_SAFETY',cost:null},
  {id:'ykk_vent',cat:'YKK',name:'ประตู Ventilation YKK',method:'per_sqm',rate:17500,min:30000,cost:null,sizeCheck:'vent',closer:1},
  {id:'ykk_exhido',cat:'YKK',name:'ประตู Exhido YKK',method:'bucket',min:50000,rates:'EXHIDO',cost:null,sizeCheck:'exhido',closer:1},
  {id:'tostem_a01',cat:'YKK',name:'Tostem Airflow A01',method:'per_sqm',rate:17500,min:34000,cost:null,closer:1},
];

// ============ ENGINE FUNCTIONS ============

export function rateOf(area: number, t: [number, number, number][]): number {
  if (area < t[0][0]) return t[0][2];
  for (const r of t) {
    if (area >= r[0] && area < r[1]) return r[2];
  }
  return t[t.length - 1][2];
}

export function roundUp(x: number): number {
  return Math.ceil(x / 1000) * 1000;
}

export function monoRate(area: number, t: [number, number, number][]): number {
  let v = area * rateOf(area, t);
  for (const r of t) {
    if (r[1] <= area) {
      const e = r[1] * r[2];
      if (e > v) v = e;
    }
  }
  return v;
}

export function interpCost(key: string | null | undefined, area: number): number | null {
  if (!key || !COSTS[key]) return null;
  const m = new Map<number, number[]>();
  for (const pt of COSTS[key]) {
    if (!m.has(pt[0])) m.set(pt[0], []);
    m.get(pt[0])!.push(pt[1]);
  }
  const arr = [...m.entries()]
    .map(e => [e[0], e[1].reduce((a, b) => a + b, 0) / e[1].length] as [number, number])
    .sort((a, b) => a[0] - b[0]);
  if (area <= arr[0][0]) return arr[0][1];
  if (area >= arr[arr.length - 1][0]) return arr[arr.length - 1][1];
  for (let i = 0; i < arr.length - 1; i++) {
    const [a1, c1] = arr[i];
    const [a2, c2] = arr[i + 1];
    if (area >= a1 && area <= a2) return c1 + (c2 - c1) * (area - a1) / (a2 - a1);
  }
  return arr[arr.length - 1][1];
}

export function colorPrice(ci: number, a: number, series: string): number {
  const c = COLORS[ci];
  if (!c) return 0;
  let rates = c.rates;
  let min = c.min || 0;
  if (c.altFor && series && c.altFor.indexOf(series) >= 0) {
    rates = c.altRates ?? null;
    min = c.altMin || 0;
  }
  if (!rates) return min;
  return Math.max(min, a * rateOf(a, rates));
}

// PBYID lookup
const PBYID: Record<string, ProductDef> = Object.fromEntries(PRODUCTS.map(p => [p.id, p]));

function basePrice(p: ProductDef, area: number, panels: number): number {
  const q: ProductDef = p.method === 'same_as' ? PBYID[p.ref!] : p;
  panels = panels || 1;
  switch (q.method) {
    case 'lift':
      if (area <= 1.5) return 20000;
      if (area <= 2.0) return 23000;
      return Math.max(23000, area * 8500);
    case 'fold':
      return Math.max(area * (q.unit_rate || 0), (q.per_panel_min || 0) * Math.max(1, panels));
    case 'fold_flat':
      return Math.max(q.min || 0, area * (q.unit_rate || 0));
    case 'ref_plus_panel':
      return basePrice(PBYID[q.ref!], area, panels) + (q.per_panel || 0) * Math.max(1, panels);
    case 'area_rate':
      return Math.max(q.min || 0, monoRate(area, RATES[q.rates!]));
    case 'area_rate_addon':
      return monoRate(area, RATES[q.rates!]);
    case 'per_sqm':
      return Math.max(q.min || 0, area * (q.rate || 0));
    default:
      return Math.max(q.min || 0, monoRate(area, RATES[q.rates!]));
  }
}

function addonCalc(p: ProductDef, panels: number): { amt: number; label: string } {
  const q: ProductDef = p.method === 'same_as' ? PBYID[p.ref!] : p;
  if (!q.addon) return { amt: 0, label: '' };
  if (q.addon.kind === 'door') {
    const a = panels >= 2 ? (q.addon.extra || 0) : 0;
    return { amt: a, label: panels >= 2 ? `บานคู่ +${a.toLocaleString()}` : '' };
  }
  if (q.addon.kind === 'window') {
    const n = Math.max(0, panels - 1);
    return { amt: n * (q.addon.extra || 0), label: n > 0 ? `บานที่2+ ${n}×${(q.addon.extra || 0).toLocaleString()}` : '' };
  }
  if (q.addon.kind === 'sliding') {
    const n = Math.min(4, Math.max(1, panels));
    const amt = q.addon.amounts?.[n] || 0;
    return { amt, label: `เลื่อน ${n} บาน +${amt.toLocaleString()}` };
  }
  return { amt: 0, label: '' };
}

// ============ EXPORTED CALC FUNCTIONS ============

export interface CalcOptions {
  glassIndex?: number;    // index ใน GLASS array (default 0)
  colorIndex?: number;    // index ใน COLORS array (default 0)
  tiltTurn?: boolean;     // tilt & turn สำหรับ awning (+5000/บาน)
  beam?: boolean;         // เพิ่มคาน (BEAM rate)
  motor?: '80' | '300';   // มอเตอร์ (สำหรับบานยก)
  closer?: number;        // ราคาโช้ค (ถ้า product มี closer)
}

export interface CalcResult {
  sell: number;
  cost: number | null;
  area: number;
  msgs: string[];
  addonLabel: string;
}

/**
 * คำนวณ 1 รายการ (ยังไม่คูณจำนวนชุด)
 * productId: id ใน PRODUCTS
 * width, height: เมตร
 * panels: จำนวนบาน
 * opts: options เพิ่มเติม
 */
export function calcItem(
  productId: string,
  width: number,
  height: number,
  panels: number = 1,
  opts: CalcOptions = {}
): CalcResult {
  const p = PBYID[productId];
  if (!p) {
    return { sell: 0, cost: null, area: 0, msgs: [`ไม่พบสินค้า: ${productId}`], addonLabel: '' };
  }

  const a = width * height;
  if (a <= 0) {
    return { sell: 0, cost: null, area: 0, msgs: ['กรอกขนาด'], addonLabel: '' };
  }

  const gi = opts.glassIndex ?? 0;
  const ci = opts.colorIndex ?? 0;
  const msgs: string[] = [];

  // ---- per_length_tier (ราวบันได) ----
  if (p.method === 'per_length_tier') {
    const len = width;
    if (len <= 0) return { sell: 0, cost: null, area: 0, msgs: ['กรอกความยาว (ม.) ในช่องกว้าง'], addonLabel: '' };
    const rate = rateOf(len, RATES[p.rates!]);
    const sell = roundUp(len * rate);
    return { sell, cost: null, area: len, msgs: [`ยาว ${len} ม. × ${rate.toLocaleString()}`], addonLabel: '' };
  }

  // ---- unit=meter ----
  if (p.unit === 'meter') {
    const len = width;
    if (len <= 0) return { sell: 0, cost: null, area: 0, msgs: ['กรอกความยาว (ม.)'], addonLabel: '' };
    return { sell: roundUp(len * (p.rate || 0)), cost: null, area: len, msgs: [`${len} ม. × ${(p.rate || 0).toLocaleString()}/ม.`], addonLabel: '' };
  }

  // ---- unit=piece ----
  if (p.unit === 'piece') {
    return { sell: p.rate || 0, cost: null, area: 1, msgs: [`1 หน่วย × ${(p.rate || 0).toLocaleString()}`], addonLabel: '' };
  }

  // ---- guard บานยก > 10 ตร.ม. ----
  if (p.cat === 'บานยก' && a > 10) {
    msgs.push('บานยกเกิน 10 ตร.ม. — ห้ามรับงานนี้ · เกิน spec ผู้ผลิต');
  }

  // ---- main calculation ----
  const base = basePrice(p, a, panels);
  const ad = addonCalc(p, panels);
  const glassUp = GLASS[gi].s * a;
  const colorUp = colorPrice(ci, a, p.series || '');
  let opt = 0;

  // tilt & turn (+5000/บาน)
  if (p.cat === 'บานกระทุ้ง' && opts.tiltTurn) {
    opt += 5000 * Math.max(1, panels);
    msgs.push(`tilt&turn +${(5000 * Math.max(1, panels)).toLocaleString()} (${Math.max(1, panels)} บาน)`);
    msgs.push('⚠ tilt & turn — ต้องเปิดออกนอกบ้านเท่านั้น');
  }

  // closer
  if (p.closer && opts.closer && opts.closer > 0) {
    opt += opts.closer;
    msgs.push(`โช้ค +${opts.closer.toLocaleString()}`);
  }

  // มอเตอร์บานยก
  if (p.motor && opts.motor) {
    if (opts.motor === '80') {
      if (a <= 3.5) { opt += 18000; msgs.push('มอเตอร์ 80 กก. +18,000'); }
      else msgs.push('มอเตอร์ 80 กก. ใช้ได้ ≤3.5 ตร.ม.');
    }
    if (opts.motor === '300') { opt += 28000; msgs.push('มอเตอร์ 300 กก. +28,000'); }
  }

  // beam
  if (p.optBeam && opts.beam) {
    opt += Math.max(4000, a * rateOf(a, RATES.BEAM));
  }

  // panel floor (multi-panel pricing)
  const pn = Math.max(1, panels);
  let floor = 0;
  const hasMultiPanel = !!(p.addon && ['door', 'window', 'sliding'].includes(p.addon.kind)) ||
    p.method === 'fold' || p.method === 'ref_plus_panel' ||
    ['sliding_sms', 'sliding_euro', 'sliding_eseries'].includes(p.id);
  if (pn > 1 && hasMultiPanel) {
    const q2: ProductDef = p.method === 'same_as' ? PBYID[p.ref!] : p;
    if (q2.rates) {
      const per = monoRate(a / pn, RATES[q2.rates]);
      floor = per * (1 + 0.67 * (pn - 1));
    }
  }
  if (['inner_top_stack', 'inner_top_slimlux', 'inner_top_xseries'].includes(p.id)) {
    floor = Math.max(floor, 14000 * (1 + 0.67 * (pn - 1)));
  }

  const core = Math.max(base + ad.amt, floor);
  const extras = glassUp + colorUp + opt;
  const sell = roundUp(core + extras);

  // cost
  const rawCost = interpCost(p.cost, a);
  const cost = rawCost !== null ? rawCost + (GLASS[gi].c - GBC) * a : null;

  // size checks
  if (p.sizeCheck === 'vent') {
    if (width < 0.6 || width > 0.9) msgs.push('⚠ กว้างควรอยู่ 0.6-0.9 ม. (YKK Vent)');
    if (height < 2.0 || height > 2.2) msgs.push('⚠ สูงควรอยู่ 2.0-2.2 ม. (YKK Vent)');
  }

  return { sell, cost, area: a, msgs, addonLabel: ad.label };
}

// ---- Public getters ----

export interface ProductOption {
  id: string;
  name: string;
  cat: string;
}

export function getProducts(): ProductOption[] {
  return PRODUCTS.map(p => ({ id: p.id, name: p.name, cat: p.cat }));
}

export interface GlassOption {
  index: number;
  name: string;
  sellUplift: number;
}

export function getGlassOptions(): GlassOption[] {
  return GLASS.map((g, i) => ({ index: i, name: g.n, sellUplift: g.s }));
}

export interface ColorOption {
  index: number;
  name: string;
  minPrice: number;
}

export function getColorOptions(): ColorOption[] {
  return COLORS.map((c, i) => ({ index: i, name: c.n, minPrice: c.min }));
}
