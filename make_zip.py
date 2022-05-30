import zipfile, os

with zipfile.ZipFile("GearGen.zip", "w") as zf:
  for root, dir, files in os.walk("."):
    for f in files:
      path = os.path.join(root, f)
      path = path.replace("\\", "/")

      if path.find("GearGen.zip") >= 0 or path.find(".idea") >= 0 or path.find(".git") >= 0:
        continue
      
      zpath = path
      while zpath.startswith(".") or zpath.startswith("/"):
        zpath = zpath[1:]
      
      zpath = "geargen/" + zpath

      print(path)
      zf.write(path, zpath)

