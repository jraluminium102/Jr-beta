from reportlab.lib.pagesizes import A4
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib import colors
from reportlab.lib.units import mm

out = 'docs/SUMMARY-quickmode-G2G3-fix-2026-06-19.pdf'
doc = SimpleDocTemplate(out, pagesize=A4, topMargin=20*mm, bottomMargin=20*mm, leftMargin=20*mm, rightMargin=20*mm)

styles = getSampleStyleSheet()
RED = colors.HexColor('#C0392B')

title_s = ParagraphStyle('T', parent=styles['Title'], fontSize=15, textColor=RED, spaceAfter=4)
h2_s = ParagraphStyle('H2', parent=styles['Heading2'], fontSize=12, textColor=RED, spaceAfter=3, spaceBefore=10)
body_s = ParagraphStyle('B', parent=styles['Normal'], fontSize=9.5, leading=15)
note_s = ParagraphStyle('N', parent=styles['Normal'], fontSize=9, textColor=colors.HexColor('#6B7280'), leading=14)

def ba_table(before, after):
    data = [['Before (เดิม)', 'After (ใหม่)'], [before, after]]
    t = Table(data, colWidths=[83*mm, 87*mm])
    t.setStyle(TableStyle([
        ('BACKGROUND',(0,0),(0,0),colors.HexColor('#FEE2E2')),
        ('BACKGROUND',(1,0),(1,0),colors.HexColor('#D1FAE5')),
        ('FONTNAME',(0,0),(1,0),'Helvetica-Bold'),
        ('FONTSIZE',(0,0),(-1,-1),9),
        ('BOX',(0,0),(-1,-1),0.5,colors.grey),
        ('INNERGRID',(0,0),(-1,-1),0.3,colors.grey),
        ('TOPPADDING',(0,0),(-1,-1),4),
        ('BOTTOMPADDING',(0,0),(-1,-1),4),
        ('VALIGN',(0,0),(-1,-1),'TOP'),
    ]))
    return t

def rn_table(rows):
    header = [['ID','Box','Face','Gap','Frame','ราคา (บ./ตร.ม.)']]
    data = header + rows
    t = Table(data, colWidths=[18*mm,28*mm,18*mm,16*mm,24*mm,26*mm])
    t.setStyle(TableStyle([
        ('BACKGROUND',(0,0),(-1,0),colors.HexColor('#374151')),
        ('TEXTCOLOR',(0,0),(-1,0),colors.white),
        ('FONTNAME',(0,0),(-1,0),'Helvetica-Bold'),
        ('FONTSIZE',(0,0),(-1,-1),8.5),
        ('ROWBACKGROUNDS',(0,1),(-1,-1),[colors.white,colors.HexColor('#F9FAFB')]),
        ('BOX',(0,0),(-1,-1),0.5,colors.grey),
        ('INNERGRID',(0,0),(-1,-1),0.3,colors.HexColor('#D1D5DB')),
        ('TOPPADDING',(0,0),(-1,-1),3),
        ('BOTTOMPADDING',(0,0),(-1,-1),3),
        ('ALIGN',(5,0),(-1,-1),'RIGHT'),
    ]))
    return t

story = []

story.append(Paragraph('สรุปงานแก้ไข Quick mode G2+G3 — 19 มิ.ย. 2569', title_s))
story.append(Paragraph('5 จุดใน public/calculator/index.html | golden-snapshot 150/150 ทุกครั้ง | push ขึ้น main แล้ว', note_s))
story.append(Spacer(1,6*mm))

# 1
story.append(Paragraph('1 — G2 cascade bug: ปุ่มระแนงมีเครื่องหมาย " ใน onclick string', h2_s))
story.append(Paragraph('<b>commit 83ac171</b> | บรรทัด ~2699-2706', body_s))
story.append(Paragraph('<b>ปัญหา:</b> onclick attribute ใส่ string ที่มี " → HTML parser ตัด attribute กลางคัน → function ได้ argument ผิด → กด 1"x1.6" แล้วหน้า/face ไม่โผล่', body_s))
story.append(Paragraph('<b>แก้:</b> ใช้ data-v attribute + .replace() แทน inline string', body_s))
story.append(Spacer(1,2*mm))
story.append(ba_table('กด 1"x1.6" → face ไม่โผล่', 'กด 1"x1.6" → face โผล่ครบ'))
story.append(Spacer(1,5*mm))

# 2
story.append(Paragraph('2 — G3 toggle ฉนวน isowall/ผนังเบา', h2_s))
story.append(Paragraph('<b>commit e473b68</b> | บรรทัด ~2282-2288', body_s))
story.append(Paragraph('<b>ปัญหา:</b> ฉนวน toggle ไม่โผล่สำหรับ isowall · ราคา +600/ตร.ม. ไม่คิด', body_s))
story.append(Paragraph('<b>แก้:</b> เพิ่ม condition isowall/wall_ext/wall_int ใน qiRenderG3 + qiCalcG3 ส่ง insul:_insulOn', body_s))
story.append(Spacer(1,2*mm))
story.append(ba_table('กด "มีฉนวน" → ราคาไม่เปลี่ยน', 'กด "มีฉนวน" → +600 x พื้นที่'))
story.append(Spacer(1,5*mm))

# 3
story.append(Paragraph('3 — G2 ระแนงผนัง 1"x1.6" face 1.6" หายจาก cascade', h2_s))
story.append(Paragraph('<b>commit 8467749</b> | บรรทัด 2631 (QIG2_BANGTA_DATA)', body_s))
story.append(Paragraph('<b>ปัญหา:</b> BANGTA_DATA มีแค่ face 1" (บังตา) สำหรับกล่อง 1"x1.6" — ผนัง face 1.6" (rn37-42) ไม่มีในระบบ', body_s))
story.append(Paragraph('<b>แก้:</b> เพิ่ม rn37-rn42 (6 รุ่น) ราคาตาม R3.9 v11', body_s))
story.append(Spacer(1,2*mm))
story.append(rn_table([
    ['rn37','1"x1.6"','1.6"','5cm','ไม่โครง','3,200'],
    ['rn38','1"x1.6"','1.6"','5cm','รวมโครง','4,900'],
    ['rn39','1"x1.6"','1.6"','3cm','ไม่โครง','3,700'],
    ['rn40','1"x1.6"','1.6"','3cm','รวมโครง','5,300'],
    ['rn41','1"x1.6"','1.6"','2cm','ไม่โครง','4,000'],
    ['rn42','1"x1.6"','1.6"','2cm','รวมโครง','5,800'],
]))
story.append(Spacer(1,5*mm))

# 4A
story.append(Paragraph('4A — G3 หลังคาเลื่อน: spanels hardcode 2 แผงเสมอ', h2_s))
story.append(Paragraph('<b>commit beced6c</b> | บรรทัด ~2278-2295, 2326', body_s))
story.append(Paragraph('<b>ปัญหา:</b> spanels:2 hardcode ใน qiCalcG3 → ปรับจำนวนแผงไม่ได้', body_s))
story.append(Paragraph('<b>แก้ 3 จุด:</b> qiRenderG3 เพิ่ม stepper .qi-g3panels | qiCalcG3 ดึงค่าจาก input | qiG3StepPanels function ปุ่ม -/+', body_s))
story.append(Spacer(1,2*mm))
story.append(ba_table('ทำเลื่อน 4 แผง → คิดราคา 2 แผงเสมอ', 'ทำเลื่อน 4 แผง → ราคาตามจำนวนแผงจริง'))
story.append(Spacer(1,5*mm))

# 4B
story.append(Paragraph('4B — G2 ระแนง 1"x1½" face 1½" หายจาก cascade', h2_s))
story.append(Paragraph('<b>commit beced6c</b> | บรรทัด 2631 (QIG2_BANGTA_DATA)', body_s))
story.append(Paragraph('<b>ปัญหา:</b> BANGTA_DATA มีแค่ face 1" สำหรับกล่อง 1"x1½" — face 1½" (rn31-36) ไม่มีในระบบ', body_s))
story.append(Paragraph('<b>แก้:</b> เพิ่ม rn31-rn36 (6 รุ่น) ราคาตาม R3.9 v11', body_s))
story.append(Spacer(1,2*mm))
story.append(rn_table([
    ['rn31','1"x1½"','1½"','5cm','ไม่โครง','3,300'],
    ['rn32','1"x1½"','1½"','5cm','รวมโครง','5,200'],
    ['rn33','1"x1½"','1½"','3cm','ไม่โครง','3,700'],
    ['rn34','1"x1½"','1½"','3cm','รวมโครง','5,600'],
    ['rn35','1"x1½"','1½"','2cm','ไม่โครง','3,700'],
    ['rn36','1"x1½"','1½"','2cm','รวมโครง','5,600'],
]))
story.append(Spacer(1,7*mm))

# summary table
story.append(Paragraph('สรุปสถานะทั้งหมด', h2_s))
sum_data = [['งาน','จุดแก้','commit','สถานะ'],
    ['G2 cascade " bug','L2699-2706','83ac171','push แล้ว'],
    ['G3 ฉนวน toggle','L2282-2288','e473b68','push แล้ว'],
    ['G2 ระแนง 1"x1.6" face 1.6"','L2631','8467749','push แล้ว'],
    ['G3 spanels stepper','L2278-2295, L2326','beced6c','push แล้ว'],
    ['G2 ระแนง 1"x1½" face 1½"','L2631','beced6c','push แล้ว']]
ts = Table(sum_data, colWidths=[55*mm,38*mm,22*mm,25*mm])
ts.setStyle(TableStyle([
    ('BACKGROUND',(0,0),(-1,0),RED),
    ('TEXTCOLOR',(0,0),(-1,0),colors.white),
    ('FONTNAME',(0,0),(-1,0),'Helvetica-Bold'),
    ('FONTSIZE',(0,0),(-1,-1),8.5),
    ('ROWBACKGROUNDS',(0,1),(-1,-1),[colors.white,colors.HexColor('#FEF2F2')]),
    ('BOX',(0,0),(-1,-1),0.5,colors.grey),
    ('INNERGRID',(0,0),(-1,-1),0.3,colors.HexColor('#D1D5DB')),
    ('TOPPADDING',(0,0),(-1,-1),4),
    ('BOTTOMPADDING',(0,0),(-1,-1),4),
    ('TEXTCOLOR',(3,1),(-1,-1),colors.HexColor('#059669')),
]))
story.append(ts)
story.append(Spacer(1,3*mm))
story.append(Paragraph('golden-snapshot 150/150 ทุก commit | ไฟล์ที่แก้: public/calculator/index.html เพียงไฟล์เดียว', note_s))

doc.build(story)
print('OK:', out)
