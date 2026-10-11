// Rasterize the app's vector mark using macOS Core Graphics. No image service is needed.
import CoreGraphics
import ImageIO
import Foundation
import UniformTypeIdentifiers

func color(_ r: CGFloat, _ g: CGFloat, _ b: CGFloat) -> CGColor {
  CGColor(red: r / 255, green: g / 255, blue: b / 255, alpha: 1)
}
for (name, size, maskable) in [("icon-192.png", 192, false), ("icon-512.png", 512, false), ("icon-maskable.png", 512, true), ("apple-touch-icon.png", 180, false)] {
  let context = CGContext(data: nil, width: size, height: size, bitsPerComponent: 8, bytesPerRow: 0, space: CGColorSpaceCreateDeviceRGB(), bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue)!
  context.scaleBy(x: CGFloat(size) / 512, y: CGFloat(size) / 512)
  context.translateBy(x: 0, y: 512)
  context.scaleBy(x: 1, y: -1)
  context.setFillColor(color(231, 120, 87))
  context.fill(CGRect(x: 0, y: 0, width: 512, height: 512))
  if maskable { context.translateBy(x: 51.2, y: 51.2); context.scaleBy(x: 0.8, y: 0.8) }
  let heart = CGMutablePath()
  heart.move(to: CGPoint(x: 120, y: 284))
  heart.addCurve(to: CGPoint(x: 226, y: 195), control1: CGPoint(x: 55, y: 206), control2: CGPoint(x: 162, y: 119))
  heart.addLine(to: CGPoint(x: 256, y: 231))
  heart.addLine(to: CGPoint(x: 286, y: 195))
  heart.addCurve(to: CGPoint(x: 392, y: 284), control1: CGPoint(x: 350, y: 119), control2: CGPoint(x: 457, y: 206))
  heart.addLine(to: CGPoint(x: 256, y: 410))
  heart.closeSubpath()
  context.setFillColor(color(255, 246, 236)); context.addPath(heart); context.fillPath()
  context.setStrokeColor(color(255, 246, 236)); context.setLineWidth(18); context.setLineCap(.round)
  context.move(to: CGPoint(x: 192, y: 134)); context.addLine(to: CGPoint(x: 211, y: 164))
  context.move(to: CGPoint(x: 321, y: 134)); context.addLine(to: CGPoint(x: 302, y: 164)); context.strokePath()
  let image = context.makeImage()!
  assert(image.width == size && image.height == size)
  let destination = CGImageDestinationCreateWithURL(URL(fileURLWithPath: "public/\(name)") as CFURL, UTType.png.identifier as CFString, 1, nil)!
  CGImageDestinationAddImage(destination, image, nil)
  assert(CGImageDestinationFinalize(destination))
}
print("Generated four install icons.")
