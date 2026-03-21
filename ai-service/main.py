from fastapi import FastAPI, File, UploadFile, Form, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Optional
import asyncio
import io
import base64
import json
import requests
import tempfile
import subprocess
import os
from PIL import Image
from dotenv import load_dotenv

# Load the backend .env file since the SARVAM_API_KEY is stored there
backend_env_path = os.path.join(os.path.dirname(__file__), "..", "backend", ".env")
load_dotenv(backend_env_path)

app = FastAPI(title="Nagar AI Forensics Service", version="2.0.0 — Phase 8")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class AIAnalysisResult(BaseModel):
    is_valid_civic_issue: bool
    issue_type: Optional[str] = None
    severity: Optional[str] = None
    confidence: Optional[float] = None
    is_fake_or_watermarked: Optional[bool] = None
    ai_summary: Optional[str] = None
    error: Optional[str] = None

# ============================================================
# Phase 8: Advanced Forensics Prompt
# ============================================================
FORENSICS_PROMPT = """You are a strict AI forensics analyst for a civic hazard reporting platform.

TASK: Analyze this image for civic/infrastructure issues AND check if it is fake.

DETECTION SCOPE (major AND micro-issues):
- Major: pothole, garbage_dump, waterlogging, fire, fallen_tree, broken_infrastructure
- Micro: broken_streetlight, open_manhole, stray_animal, peeling_road_paint, overflowing_bin, damaged_signage, sewage_leak, cracked_wall, illegal_dumping, abandoned_vehicle

FAKE DETECTION (be EXTREMELY strict):
- Look for: watermarks, stock photo logos, AI-generated artifacts, photos of computer/phone screens, memes, synthetic textures, text overlays
- If ANY of these are found, set is_fake_or_watermarked to true

SMART DISPATCH:
- Read the user_description and location_data provided below.
- Generate an ai_summary: If the user provided a description, rewrite it as: "[Problem] at [Location]. Severity: [Level]."
- If the user provided NO description, generate one purely from the image.

{context_block}

Return ONLY a raw JSON object with these keys:
- "issue_type": string (one of the types listed above, or "none")
- "severity": "High", "Medium", or "Low"
- "confidence": float 0.0-1.0
- "is_fake_or_watermarked": boolean
- "ai_summary": string (the dispatcher summary)
"""


@app.post("/analyze", response_model=AIAnalysisResult)
async def analyze_file(
    file: UploadFile = File(...),
    description: str = Form(None),
    location_data: str = Form(None)
):
    contents = await file.read()
    context = _build_context(description, location_data)
    
    if file.content_type and file.content_type.startswith("image/"):
        return await analyze_image(contents, context)
    elif file.content_type and file.content_type.startswith("video/"):
        return await analyze_video(contents, context)
    elif file.content_type and file.content_type.startswith("audio/"):
        return await analyze_audio(contents, description, location_data)
    else:
        raise HTTPException(status_code=400, detail="Unsupported file format.")


def _build_context(description: str = None, location_data: str = None) -> str:
    """Build the user context block injected into the forensics prompt."""
    parts = []
    if description:
        parts.append(f"User Description: \"{description}\"")
    else:
        parts.append("User Description: NONE PROVIDED — generate one from image analysis.")
    if location_data:
        parts.append(f"Location Data: {location_data}")
    else:
        parts.append("Location Data: Not available.")
    return "\n".join(parts)


async def analyze_image(contents: bytes, context: str):
    try:
        image = Image.open(io.BytesIO(contents))
        image.verify()
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid image file structure.")

    base64_string = base64.b64encode(contents).decode("utf-8")
    return await request_llava(base64_string, context)


async def analyze_video(contents: bytes, context: str):
    with tempfile.NamedTemporaryFile(delete=False, suffix=".mp4") as temp_video:
        temp_video.write(contents)
        temp_video_path = temp_video.name
        
    temp_frame_path = temp_video_path + "_frame.jpg"
    
    try:
        subprocess.run([
            "ffmpeg", "-y", "-i", temp_video_path, "-ss", "00:00:01", "-vframes", "1", temp_frame_path
        ], check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        
        with open(temp_frame_path, "rb") as frame_file:
            frame_bytes = frame_file.read()
            
        base64_string = base64.b64encode(frame_bytes).decode("utf-8")
        return await request_llava(base64_string, context)
        
    except subprocess.CalledProcessError:
        print("[AI CORE ERROR] FFmpeg failed to extract frame.")
        return _error_result("Failed to process video file.")
    finally:
        if os.path.exists(temp_video_path):
            os.remove(temp_video_path)
        if os.path.exists(temp_frame_path):
            os.remove(temp_frame_path)


async def request_llava(base64_string: str, context: str = ""):
    """Phase 8: Advanced forensics + fake detection + smart dispatch."""
    
    prompt = FORENSICS_PROMPT.format(context_block=context)

    payload = {
        "model": "llava",
        "prompt": prompt,
        "images": [base64_string],
        "format": "json",
        "stream": False
    }

    try:
        response = await asyncio.to_thread(
            requests.post,
            "http://localhost:11434/api/generate",
            json=payload,
            timeout=90
        )
        response.raise_for_status()
        
        response_data = response.json()
        ai_response_text = response_data.get("response", "")
        
        # Clean markdown fencing
        ai_response_text = ai_response_text.strip()
        if ai_response_text.startswith("```json"):
            ai_response_text = ai_response_text[7:]
        elif ai_response_text.startswith("```"):
            ai_response_text = ai_response_text[3:]
        if ai_response_text.endswith("```"):
            ai_response_text = ai_response_text[:-3]
        ai_response_text = ai_response_text.strip()
        
        parsed_json = json.loads(ai_response_text)
        
        return _enforce_rules(parsed_json)

    except json.JSONDecodeError as e:
        print(f"[AI CORE ERROR] JSON parse failed: {e} | Raw: {ai_response_text[:200]}")
        return _error_result("AI returned unparseable response.")
    except Exception as e:
        print(f"[AI CORE ERROR] Exception: {e}")
        return _error_result("AI processing failed, timed out, or returned invalid JSON.")


def _enforce_rules(parsed_json: dict) -> dict:
    """Phase 8: Python Rule Enforcement with fake detection + keyword fallback + ai_summary."""
    
    valid_hazards = [
        # Major
        'pothole', 'garbage', 'garbage_dump', 'waterlogging', 'fire', 'fallen_tree', 'broken_infrastructure',
        # Micro (Phase 8)
        'broken_streetlight', 'open_manhole', 'stray_animal', 'peeling_road_paint',
        'overflowing_bin', 'damaged_signage', 'sewage_leak', 'cracked_wall',
        'illegal_dumping', 'abandoned_vehicle'
    ]
    
    # Synonym map: common words the LLM might use → canonical issue_type
    keyword_map = {
        'pothole': 'pothole', 'pot hole': 'pothole', 'road damage': 'pothole', 'crater': 'pothole',
        'garbage': 'garbage', 'trash': 'garbage', 'litter': 'garbage', 'waste': 'garbage', 'garbage_dump': 'garbage_dump', 'rubbish': 'garbage',
        'waterlogging': 'waterlogging', 'flood': 'waterlogging', 'water logging': 'waterlogging', 'stagnant water': 'waterlogging', 'waterlog': 'waterlogging',
        'fire': 'fire', 'blaze': 'fire', 'flames': 'fire', 'burning': 'fire', 'smoke': 'fire',
        'fallen tree': 'fallen_tree', 'fallen_tree': 'fallen_tree', 'uprooted tree': 'fallen_tree', 'tree fall': 'fallen_tree',
        'broken infrastructure': 'broken_infrastructure', 'broken_infrastructure': 'broken_infrastructure', 'damaged road': 'broken_infrastructure', 'collapsed': 'broken_infrastructure',
        'streetlight': 'broken_streetlight', 'street light': 'broken_streetlight', 'broken_streetlight': 'broken_streetlight', 'lamp post': 'broken_streetlight',
        'manhole': 'open_manhole', 'open_manhole': 'open_manhole', 'open manhole': 'open_manhole',
        'stray animal': 'stray_animal', 'stray_animal': 'stray_animal', 'stray dog': 'stray_animal', 'stray cattle': 'stray_animal',
        'road paint': 'peeling_road_paint', 'peeling_road_paint': 'peeling_road_paint', 'faded marking': 'peeling_road_paint',
        'overflowing bin': 'overflowing_bin', 'overflowing_bin': 'overflowing_bin', 'dustbin': 'overflowing_bin',
        'signage': 'damaged_signage', 'damaged_signage': 'damaged_signage', 'broken sign': 'damaged_signage',
        'sewage': 'sewage_leak', 'sewage_leak': 'sewage_leak', 'drain': 'sewage_leak', 'sewer': 'sewage_leak',
        'cracked wall': 'cracked_wall', 'cracked_wall': 'cracked_wall',
        'illegal dumping': 'illegal_dumping', 'illegal_dumping': 'illegal_dumping',
        'abandoned vehicle': 'abandoned_vehicle', 'abandoned_vehicle': 'abandoned_vehicle', 'abandoned car': 'abandoned_vehicle',
    }
    
    extracted_issue = str(parsed_json.get("issue_type", "none")).lower().strip()
    ai_summary = str(parsed_json.get("ai_summary", "")).strip()
    is_fake = bool(parsed_json.get("is_fake_or_watermarked", False))
    
    # ====== KEYWORD FALLBACK ======
    # If the LLM forgot the issue_type but wrote a good ai_summary, recover it
    if extracted_issue not in valid_hazards and not is_fake:
        summary_lower = ai_summary.lower()
        # First try exact valid_hazards match
        for hazard in valid_hazards:
            if hazard.replace('_', ' ') in summary_lower or hazard in summary_lower:
                extracted_issue = hazard
                print(f"[AI FORENSICS FALLBACK] Recovered issue_type='{hazard}' from ai_summary")
                break
        # If still not found, try synonym keyword map
        if extracted_issue not in valid_hazards:
            for keyword, canonical in keyword_map.items():
                if keyword in summary_lower:
                    extracted_issue = canonical
                    print(f"[AI FORENSICS FALLBACK] Recovered issue_type='{canonical}' via keyword '{keyword}'")
                    break
    
    # Severity — default to High (bias toward caution)
    severity = str(parsed_json.get("severity", "High")).capitalize()
    if severity not in ["High", "Medium", "Low"]:
        severity = "High"
        
    # Confidence — default to 0.8 if AI didn't provide one
    try:
        confidence = float(parsed_json.get("confidence", 0.8))
        confidence = max(0.0, min(1.0, confidence))
    except (ValueError, TypeError):
        confidence = 0.8
    
    # Generate summary if empty
    if not ai_summary:
        ai_summary = f"Detected {extracted_issue.replace('_', ' ')} issue. Severity: {severity}."
    
    # Hard enforcement: if fake → not valid
    is_valid = True if (extracted_issue in valid_hazards and not is_fake) else False
    
    result = {
        "is_valid_civic_issue": is_valid,
        "issue_type": extracted_issue if is_valid else "none",
        "severity": severity,
        "confidence": confidence,
        "is_fake_or_watermarked": is_fake,
        "ai_summary": ai_summary,
        "error": None
    }
    
    print(f"[AI FORENSICS] issue={extracted_issue} | valid={is_valid} | fake={is_fake} | severity={severity} | conf={confidence}")
    return result


def _error_result(message: str) -> dict:
    """Return a standardized error result."""
    return {
        "is_valid_civic_issue": False,
        "issue_type": "none",
        "severity": "Low",
        "confidence": 0.0,
        "is_fake_or_watermarked": False,
        "ai_summary": "",
        "error": message
    }


# ============================================================
# Audio Analysis (unchanged, uses Sarvam STT → Ollama text)
# ============================================================
async def analyze_audio(contents: bytes, description: str = None, location_data: str = None):
    transcript = ""
    
    with tempfile.NamedTemporaryFile(delete=False, suffix=".raw") as temp_raw:
        temp_raw.write(contents)
        temp_raw_path = temp_raw.name
        
    temp_wav_path = temp_raw_path + ".wav"
        
    try:
        subprocess.run([
            "ffmpeg", "-y", "-i", temp_raw_path, "-ar", "16000", "-ac", "1", temp_wav_path
        ], check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        
        sarvam_api_key = os.getenv("SARVAM_API_KEY", "")
        headers = {"api-subscription-key": sarvam_api_key}
        data = {"prompt": ""}
        
        with open(temp_wav_path, "rb") as f:
            files = {"file": ("audio.wav", f, "audio/wav")}
            response = await asyncio.to_thread(
                requests.post,
                "https://api.sarvam.ai/speech-to-text-translate",
                headers=headers,
                files=files,
                data=data,
                timeout=60
            )
        response.raise_for_status()
        transcript_data = response.json()
        transcript = transcript_data.get("transcript", "")
    except subprocess.CalledProcessError:
        print("[AI CORE ERROR] FFmpeg Audio Conversion Failed.")
        return _error_result("Failed to process audio format locally.")
    except Exception as e:
        print(f"[AI CORE ERROR] Sarvam API Exception: {e}")
        return _error_result(f"Audio transcription failed: {str(e)}")
    finally:
        if os.path.exists(temp_raw_path):
            os.remove(temp_raw_path)
        if os.path.exists(temp_wav_path):
            os.remove(temp_wav_path)
            
    if not transcript:
        return _error_result("Audio transcription returned empty.")

    # Build context for audio-based analysis
    context_parts = [f"Audio Transcript: \"{transcript}\""]
    if description:
        context_parts.append(f"User Description: \"{description}\"")
    if location_data:
        context_parts.append(f"Location Data: {location_data}")
        
    payload = {
        "model": "llama3.2:1b",
        "prompt": f"""Analyze this civic hazard report from an audio transcript.
{chr(10).join(context_parts)}

Return ONLY a raw JSON object with these keys:
- "issue_type": one of pothole, garbage, waterlogging, fire, fallen_tree, broken_infrastructure, broken_streetlight, open_manhole, stray_animal, peeling_road_paint, overflowing_bin, damaged_signage, sewage_leak, cracked_wall, illegal_dumping, abandoned_vehicle, or "none"
- "severity": "High", "Medium", or "Low"
- "confidence": float 0.0-1.0
- "is_fake_or_watermarked": false (audio cannot be visually fake)
- "ai_summary": a brief dispatcher summary of the issue""",
        "format": "json",
        "stream": False
    }

    try:
        response = await asyncio.to_thread(
            requests.post,
            "http://localhost:11434/api/generate",
            json=payload,
            timeout=60
        )
        response.raise_for_status()
        
        response_data = response.json()
        ai_response_text = response_data.get("response", "")
        
        ai_response_text = ai_response_text.strip()
        if ai_response_text.startswith("```json"):
            ai_response_text = ai_response_text[7:]
        elif ai_response_text.startswith("```"):
            ai_response_text = ai_response_text[3:]
        if ai_response_text.endswith("```"):
            ai_response_text = ai_response_text[:-3]
        ai_response_text = ai_response_text.strip()
        
        parsed_json = json.loads(ai_response_text)
        return _enforce_rules(parsed_json)
        
    except Exception as e:
        print(f"[AI CORE ERROR] Ollama Exception: {e}")
        return _error_result("AI reasoning failed or timed out.")


@app.get("/")
def health_check():
    return {"status": "AI Forensics Service v2.0 — Phase 8 Active", "capabilities": ["image", "video", "audio", "fake_detection", "smart_dispatch"]}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
