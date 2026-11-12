#!/usr/bin/env python3
"""Create Windows icon from SVG using PIL."""
import os
from pathlib import Path

try:
    from PIL import Image
    import cairosvg
    import io
    
    # Create PNG from SVG
    svg_path = Path("icon.svg")
    png_buffer = io.BytesIO()
    
    cairosvg.svg2png(url=str(svg_path), write_to=png_buffer)
    png_buffer.seek(0)
    
    # Open PNG and create ICO
    img = Image.open(png_buffer)
    
    # Resize to icon sizes
    sizes = [(16, 16), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)]
    img_resized = img.convert("RGBA")
    img_resized.save("build/icon.ico", sizes=sizes)
    print("✓ Created build/icon.ico")
    
except ImportError:
    # Fallback: just copy SVG as icon reference
    print("PIL/cairosvg not available, using SVG reference")
    import shutil
    os.makedirs("build", exist_ok=True)
    
    # Create a minimal PNG icon instead
    from PIL import Image, ImageDraw
    img = Image.new("RGB", (256, 256), color="white")
    draw = ImageDraw.Draw(img)
    draw.ellipse([50, 50, 206, 206], fill="#4A90E2", outline="#2E5C8A")
    img.save("build/icon.ico")
    print("✓ Created build/icon.ico (placeholder)")
