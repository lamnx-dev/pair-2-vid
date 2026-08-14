import fs from "fs"
import path from "path"
import { fileURLToPath } from "url"
import { generateThumbnailImage, wrapTitleText } from "../src/thumbnail.js"

const moduleDir = path.dirname(fileURLToPath(import.meta.url))
const pkgRootDir = path.resolve(moduleDir, "..")
const outputDir = path.resolve(pkgRootDir, "tests/artifacts/thumbnails")

if (!fs.existsSync(outputDir)) {
  fs.mkdirSync(outputDir, { recursive: true })
}

// Comprehensive test matrix covering 1 to 12 words:
// Includes short words, long words, mixed short/long, accents, ascenders/descenders
const testCases: { name: string; text: string; note: string }[] = [
  // 1 word
  {
    name: "01_1w_short",
    text: "AI",
    note: "1 từ ngắn (2 ký tự)",
  },
  {
    name: "02_1w_medium",
    text: "Review",
    note: "1 từ vừa (6 ký tự)",
  },
  {
    name: "03_1w_long",
    text: "Microservices",
    note: "1 từ dài (13 ký tự)",
  },

  // 2 words
  {
    name: "04_2w_short",
    text: "Học Code",
    note: "2 từ ngắn (8 ký tự)",
  },
  {
    name: "05_2w_mixed",
    text: "Tôi ĐangCode",
    note: "2 từ ngắn + dài",
  },
  {
    name: "06_2w_long",
    text: "ChatGPT DeepSeek",
    note: "2 từ dài (16 ký tự)",
  },

  // 3 words
  {
    name: "07_3w_short",
    text: "Mẹo Cực Hay",
    note: "3 từ ngắn -> 2 dòng cân đối",
  },
  {
    name: "08_3w_mixed",
    text: "Tối Ưu Performance",
    note: "3 từ: ngắn ngắn dài",
  },
  {
    name: "09_3w_long",
    text: "Trải Nghiệm Smartphone",
    note: "3 từ dài",
  },

  // 4 words
  {
    name: "10_4w_balanced",
    text: "Tại Sao Nên Dùng",
    note: "4 từ cân đối (2-2)",
  },
  {
    name: "11_4w_mixed",
    text: "Bí Quyết Thành Công Lớn",
    note: "4 từ ngắn dài xáo trộn",
  },

  // 5 words
  {
    name: "12_5w_short_words",
    text: "Tôi Đã Bị Lừa Rồi",
    note: "5 từ ngắn",
  },
  {
    name: "13_5w_mixed_lengths",
    text: "Cách Tối Ưu Tốc Độ Video",
    note: "5 từ: ngắn + dài xáo trộn (3 dòng)",
  },

  // 6 words
  {
    name: "14_6w_balanced",
    text: "Hướng Dẫn Tạo Video Tự Động",
    note: "6 từ cân đối (3 dòng)",
  },
  {
    name: "15_6w_mixed_lengths",
    text: "Tại Sao Developer Thích Dùng Mac",
    note: "6 từ có từ dài ở giữa",
  },

  // 7 words
  {
    name: "16_7w_phone_story",
    text: "Khi Ai Phôn Cố Tình Bị Bóp",
    note: "7 từ có dấu mũ, sắc, nặng (3 dòng)",
  },
  {
    name: "17_7w_mixed",
    text: "Tôi Đã Kiếm Được Tiền Nhờ AI",
    note: "7 từ ngắn dài xáo trộn",
  },

  // 8 words
  {
    name: "18_8w_greeting",
    text: "Xin Chào Mọi Người Tôi Là Lâm Developer",
    note: "8 từ (4 dòng)",
  },
  {
    name: "19_8w_tech_question",
    text: "Tại Sao Bạn Vẫn Chưa Học Lập Trình AI",
    note: "8 từ câu hỏi dài (4 dòng)",
  },

  // 9 words
  {
    name: "20_9w_story",
    text: "Những Bí Mật Đằng Sau Các Ứng Dụng Nổi Tiếng",
    note: "9 từ",
  },

  // 10 words
  {
    name: "21_10w_long_title",
    text: "Khám Phá Các Công Nghệ Trí Tuệ Nhân Tạo Mới Nhất Hiện Nay",
    note: "10 từ",
  },

  // 11 words
  {
    name: "22_11w_lifestyle",
    text: "Một Ngày Trải Nghiệm Làm Việc Tự Do Không Cần Đến Công Ty",
    note: "11 từ",
  },

  // 12 words
  {
    name: "23_12w_full_workflow",
    text: "Khám Phá Toàn Bộ Quy Trình Tự Động Hóa Sản Xuất Video Bằng Trí Tuệ AI",
    note: "12 từ tiêu đề dài nhất",
  },
]

console.log(
  `🚀 Generating ${testCases.length} comprehensive test thumbnails into:\n📂 ${outputDir}\n`
)

for (const [index, tc] of testCases.entries()) {
  const wrapped = wrapTitleText(tc.text)
  const lines = wrapped.split("\n").filter((l) => l.trim().length > 0)
  const outputPath = path.resolve(outputDir, `${tc.name}.png`)

  console.log(
    `[${index + 1}/${testCases.length}] "${tc.text}" (${tc.note}) -> ${lines.length} lines`
  )
  lines.forEach((l, i) =>
    console.log(`   L${i + 1} (${l.length} chars): "${l}"`)
  )

  try {
    await generateThumbnailImage({
      titleText: tc.text,
      outputPath,
    })
    console.log(`  ✓ Saved: ${path.basename(outputPath)}\n`)
  } catch (err) {
    console.error(`  ✗ Error generating "${tc.text}":`, err)
  }
}

console.log(
  `🎉 All ${testCases.length} test thumbnails generated in: ${outputDir}`
)
