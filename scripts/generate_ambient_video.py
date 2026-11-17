import math
import subprocess
import os

WIDTH = 1280
HEIGHT = 720
FPS = 24
DURATION = 6.0
TOTAL_FRAMES = int(FPS * DURATION)

OUTPUT_MP4 = "public/assets/meetmind_ambient_bg.mp4"
OUTPUT_POSTER = "public/assets/meetmind_ambient_poster.png"

# Golden Palette
GOLD_R = 212
GOLD_G = 175
GOLD_B = 55

# 16 Neural Network Nodes (base coordinates and orbit parameters)
NODES = [
    (160, 180, 25, 0.0),
    (320, 240, 20, 1.2),
    (480, 160, 30, 2.5),
    (640, 260, 25, 3.8),
    (800, 190, 22, 0.7),
    (960, 270, 28, 2.1),
    (1120, 180, 24, 4.2),
    (240, 380, 22, 5.0),
    (420, 440, 26, 1.8),
    (620, 380, 30, 3.1),
    (820, 450, 25, 4.7),
    (1020, 370, 20, 0.4),
    (1200, 440, 22, 2.9),
    (340, 560, 18, 1.5),
    (740, 580, 20, 3.4),
    (1060, 560, 18, 5.2),
]

# Audio spectrum bars parameters
NUM_BARS = 48

def render_frame(frame_idx):
    # Buffer initialized to matte dark (#070709)
    buf = bytearray(WIDTH * HEIGHT * 3)
    
    theta = 2.0 * math.pi * frame_idx / TOTAL_FRAMES
    sin_t = math.sin(theta)
    cos_t = math.cos(theta)

    # 1. Base matte dark fill with subtle top radial gradient
    cx = WIDTH // 2
    cy = int(HEIGHT * 0.1)
    max_dist_sq = (WIDTH * 0.7) ** 2
    
    # Pre-render background scanlines
    for y in range(HEIGHT):
        y_offset = y * WIDTH * 3
        dy_sq = (y - cy) ** 2
        for x in range(0, WIDTH, 4):  # step 4 for high performance
            dx_sq = (x - cx) ** 2
            d_sq = dx_sq + dy_sq
            
            # Subtle radial gold glow
            glow = max(0.0, 1.0 - (d_sq / max_dist_sq)) * 0.05
            
            # Base color #070709
            r = int(7 + glow * GOLD_R)
            g = int(7 + glow * GOLD_G)
            b = int(9 + glow * GOLD_B)
            
            idx = y_offset + x * 3
            for k in range(min(4, WIDTH - x)):
                buf[idx + k*3] = r
                buf[idx + k*3 + 1] = g
                buf[idx + k*3 + 2] = b

    def set_pixel_add(x, y, r, g, b, alpha):
        if 0 <= x < WIDTH and 0 <= y < HEIGHT:
            idx = (y * WIDTH + x) * 3
            buf[idx] = min(255, int(buf[idx] + r * alpha))
            buf[idx + 1] = min(255, int(buf[idx + 1] + g * alpha))
            buf[idx + 2] = min(255, int(buf[idx + 2] + b * alpha))

    def draw_thick_line(x0, y0, x1, y1, r, g, b, alpha):
        dx = x1 - x0
        dy = y1 - y0
        dist = math.hypot(dx, dy)
        if dist < 1:
            return
        steps = int(dist * 1.5)
        for s in range(steps + 1):
            t = s / steps
            px = int(x0 + dx * t)
            py = int(y0 + dy * t)
            set_pixel_add(px, py, r, g, b, alpha)
            set_pixel_add(px + 1, py, r, g, b, alpha * 0.5)
            set_pixel_add(px, py + 1, r, g, b, alpha * 0.5)

    def draw_glow_circle(cx, cy, radius, r, g, b, alpha):
        ir = int(radius + 2)
        for dy in range(-ir, ir + 1):
            py = cy + dy
            if 0 <= py < HEIGHT:
                for dx in range(-ir, ir + 1):
                    px = cx + dx
                    d = math.hypot(dx, dy)
                    if d <= radius:
                        a = alpha * (1.0 - d / (radius + 1))
                        set_pixel_add(px, py, r, g, b, a)

    # 2. Render Audio Spectrum Equalizer Bars at bottom
    bar_width = 8
    bar_gap = 18
    start_x = (WIDTH - (NUM_BARS * (bar_width + bar_gap))) // 2
    base_y = int(HEIGHT * 0.92)
    
    for i in range(NUM_BARS):
        bx = start_x + i * (bar_width + bar_gap)
        phase = (i / NUM_BARS) * 4.0 * math.pi + theta
        bar_h = int(12 + 28 * (math.sin(phase) * 0.5 + 0.5) * (math.cos(phase * 0.5 + theta) * 0.5 + 0.5))
        
        for by in range(base_y - bar_h, base_y):
            for bw in range(bar_width):
                fade = (by - (base_y - bar_h)) / max(1, bar_h)
                set_pixel_add(bx + bw, by, GOLD_R, GOLD_G, GOLD_B, 0.12 * fade)

    # 3. Compute Node Positions and Draw Connecting Neural Synapses
    current_nodes = []
    for nx, ny, orbit, phase_offset in NODES:
        angle = theta + phase_offset
        curr_x = int(nx + orbit * math.cos(angle))
        curr_y = int(ny + orbit * math.sin(angle) * 0.6)
        current_nodes.append((curr_x, curr_y))

    # Draw Synaptic Connections
    for i in range(len(current_nodes)):
        x1, y1 = current_nodes[i]
        for j in range(i + 1, len(current_nodes)):
            x2, y2 = current_nodes[j]
            dist = math.hypot(x2 - x1, y2 - y1)
            if dist < 230:
                line_alpha = (1.0 - dist / 230.0) * 0.16
                draw_thick_line(x1, y1, x2, y2, GOLD_R, GOLD_G, GOLD_B, line_alpha)

    # Draw Neural Nodes
    for i, (curr_x, curr_y) in enumerate(current_nodes):
        node_pulse = 0.6 + 0.4 * math.sin(theta * 2 + i)
        draw_glow_circle(curr_x, curr_y, 4, 255, 235, 140, 0.6 * node_pulse)
        draw_glow_circle(curr_x, curr_y, 7, GOLD_R, GOLD_G, GOLD_B, 0.25 * node_pulse)

    # 4. Render Harmonic Audio Sine Waveforms (Voice & Speech Recognition)
    for x in range(0, WIDTH, 2):
        # Wave 1: Primary voice speech carrier
        y1 = int(HEIGHT * 0.48 + 
                 42.0 * math.sin(0.008 * x + theta) * math.cos(0.004 * x - theta) + 
                 16.0 * math.sin(0.016 * x + theta * 2))
        
        # Wave 2: Upper harmonic frequency
        y2 = int(HEIGHT * 0.52 + 
                 35.0 * math.sin(0.006 * x - theta + 1.0) + 
                 20.0 * math.cos(0.012 * x + theta))
        
        # Wave 3: Fine ambient resonance
        y3 = int(HEIGHT * 0.44 + 
                 22.0 * math.cos(0.01 * x + theta * 1.5))

        # Draw wave 1
        set_pixel_add(x, y1, 255, 225, 120, 0.35)
        set_pixel_add(x, y1 - 1, GOLD_R, GOLD_G, GOLD_B, 0.2)
        set_pixel_add(x, y1 + 1, GOLD_R, GOLD_G, GOLD_B, 0.2)

        # Draw wave 2
        set_pixel_add(x, y2, GOLD_R, GOLD_G, GOLD_B, 0.22)
        set_pixel_add(x, y2 - 1, GOLD_R, GOLD_G, GOLD_B, 0.12)
        set_pixel_add(x, y2 + 1, GOLD_R, GOLD_G, GOLD_B, 0.12)

        # Draw wave 3
        set_pixel_add(x, y3, 180, 150, 40, 0.18)

    # 5. Floating Knowledge Particles
    for p in range(24):
        p_phase = p * 1.618
        px = int((math.sin(theta + p_phase) * 0.5 + 0.5) * WIDTH)
        py = int((math.cos(theta * 0.8 + p_phase * 2) * 0.5 + 0.5) * HEIGHT)
        p_alpha = 0.2 + 0.2 * math.sin(theta * 3 + p)
        draw_glow_circle(px, py, 3, 255, 230, 150, p_alpha)

    return bytes(buf)

def main():
    print(f"Generating MeetMind AI ambient video ({TOTAL_FRAMES} frames, {DURATION}s)...")
    
    # Launch ffmpeg encoder for MP4
    cmd_mp4 = [
        "ffmpeg", "-y",
        "-f", "rawvideo",
        "-vcodec", "rawvideo",
        "-s", f"{WIDTH}x{HEIGHT}",
        "-pix_fmt", "rgb24",
        "-r", str(FPS),
        "-i", "-",
        "-c:v", "libx264",
        "-profile:v", "high",
        "-level", "4.0",
        "-crf", "26",
        "-preset", "medium",
        "-pix_fmt", "yuv420p",
        "-movflags", "+faststart",
        OUTPUT_MP4
    ]
    
    p_mp4 = subprocess.Popen(cmd_mp4, stdin=subprocess.PIPE)
    
    poster_frame_data = None
    for f in range(TOTAL_FRAMES):
        raw = render_frame(f)
        p_mp4.stdin.write(raw)
        if f == 0:
            poster_frame_data = raw
        if f % 24 == 0:
            print(f"Progress: frame {f}/{TOTAL_FRAMES} ({int(f/TOTAL_FRAMES*100)}%)")
            
    p_mp4.stdin.close()
    p_mp4.wait()
    print("MP4 generated successfully.")

    # Generate Poster Image from frame 0
    if poster_frame_data:
        cmd_poster = [
            "ffmpeg", "-y",
            "-f", "rawvideo",
            "-vcodec", "rawvideo",
            "-s", f"{WIDTH}x{HEIGHT}",
            "-pix_fmt", "rgb24",
            "-i", "-",
            "-vframes", "1",
            OUTPUT_POSTER
        ]
        p_poster = subprocess.Popen(cmd_poster, stdin=subprocess.PIPE)
        p_poster.stdin.write(poster_frame_data)
        p_poster.stdin.close()
        p_poster.wait()
        print("Poster image generated successfully.")

    # Also convert poster to webp for ultra fast loading
    cmd_webp = [
        "ffmpeg", "-y",
        "-i", OUTPUT_POSTER,
        "-c:v", "libwebp",
        "-quality", "85",
        "public/assets/meetmind_ambient_poster.webp"
    ]
    subprocess.run(cmd_webp, check=True)
    print("WebP poster generated successfully.")

    # Generate WebM VP9 version as lightweight alternative
    cmd_webm = [
        "ffmpeg", "-y",
        "-i", OUTPUT_MP4,
        "-c:v", "libvpx-vp9",
        "-crf", "36",
        "-b:v", "0",
        "public/assets/meetmind_ambient_bg.webm"
    ]
    subprocess.run(cmd_webm, check=True)
    print("WebM video generated successfully.")

if __name__ == "__main__":
    main()
