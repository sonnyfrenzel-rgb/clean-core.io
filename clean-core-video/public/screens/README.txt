Drop your screen recordings here, e.g. analyze.mp4 / design.mp4 (1080p, 5-8s each).
Then wire them into scene 5 (S5Live) in src/CleanCoreVideo.tsx via:
  <OffthreadVideo src={staticFile('screens/analyze.mp4')} ... />
The video renders fine without them (scene 5 has a polished mock).
