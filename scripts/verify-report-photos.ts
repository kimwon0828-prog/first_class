import assert from "node:assert/strict"
import fs from "node:fs"
import sharp from "sharp"
import { validateReportPhoto } from "../src/features/reports/server/validate-report-photo"
import { parseReportAttachments, detectPhotoType, REPORT_PHOTO_BYTES } from "../src/features/reports/lib/report-attachments"
import { buildExperienceReportSnapshotV4, decodeExperienceReportSnapshot, getReportAttachments } from "../src/features/reports/lib/experience-report-snapshot"
async function main() {
 const image=await sharp({create:{width:600,height:1600,channels:3,background:'#faf7ee'}}).png().toBuffer()
 assert.equal(detectPhotoType(image),'image/png')
 const clean=await validateReportPhoto(image,'image/png');assert.equal(clean.width,600);assert.equal(clean.height,1600)
 for(const type of ['jpeg','webp'] as const){const data=await sharp(image)[type]().toBuffer();const photo=await validateReportPhoto(data,`image/${type}`);assert.equal(photo.mimeType,`image/${type}`)}
 const tagged=await sharp(image).jpeg().withMetadata({orientation:6,exif:{IFD0:{Artist:'PRIVATE_METADATA'}}}).toBuffer();const sanitized=await validateReportPhoto(tagged,'image/jpeg');const meta=await sharp(sanitized.data).metadata();assert(!meta.exif);assert.equal(sanitized.width,1600);assert.equal(sanitized.height,600)
 await assert.rejects(validateReportPhoto(Buffer.from('<svg></svg>'),'image/png'))
 await assert.rejects(validateReportPhoto(image,'image/jpeg'))
 await assert.rejects(validateReportPhoto(image.subarray(0,32),'image/png'))
 await assert.rejects(validateReportPhoto(Buffer.alloc(REPORT_PHOTO_BYTES+1),'image/png'))
 const huge=await sharp({create:{width:5000,height:5000,channels:3,background:'#fff'}}).png().toBuffer();await assert.rejects(validateReportPhoto(huge,'image/png'))
 const snapshot=JSON.parse(fs.readFileSync(process.env.PHOTO_SNAPSHOT_PATH!,'utf8'))
 assert.deepEqual(decodeExperienceReportSnapshot(4,snapshot),snapshot)
 for(const v of [1,2,3])assert.equal(decodeExperienceReportSnapshot(v,snapshot),null,'Old reader refuses V4 extra field; Parent V4 deployment first')
 const {attachments,...text}=snapshot;assert(decodeExperienceReportSnapshot(3,text));assert.deepEqual(getReportAttachments(text),[])
 assert.equal(parseReportAttachments([...attachments,...attachments]),null);assert.equal(parseReportAttachments([{...attachments[0],caption:'x'.repeat(101)}]),null)
 assert.equal(decodeExperienceReportSnapshot(4,{...snapshot,attachments:[{...attachments[0],url:'https://expired.invalid'}]}),null)
 const source={programType:snapshot.experience.type,confirmedSlotAt:snapshot.experience.date,completedAt:null,childName:snapshot.experience.child.displayName,childGrade:snapshot.experience.child.grade,academyName:snapshot.experience.academy.name,classTitle:snapshot.experience.class.title,observations:snapshot.observations.map((o:{code:string})=>o.code),recommendedCourse:snapshot.recommendation.course,recommendedLevel:snapshot.recommendation.level,recommendedSchedule:snapshot.recommendation.schedule,publicSummary:snapshot.summary,attachments}
 const built=buildExperienceReportSnapshotV4(source);assert.equal(built.status,'ok');if(built.status==='ok')assert.deepEqual(built.snapshot,snapshot,'Studio builder and actual SQL V4 snapshot match')
 console.log('PASS actual image decoder/MIME/size/pixels/EXIF/orientation; V1-V4 decode, caption/ID validation, DB/preview snapshot equality')
}
main().catch(e=>{console.error(e);process.exitCode=1})
