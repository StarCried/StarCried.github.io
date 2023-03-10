import os, json, time

with open(os.path.abspath(os.path.join(os.path.dirname(__file__), "../blog/index.json")), "r", encoding = "utf-8") as f:
    bloginfo = json.load(f)
    
mxpid = max(list(map(int, bloginfo.keys()))) + 1
while True:
    try:
        arr = input("add <title> <url> [<pid>]| del <pid>:").split()
        if arr[0] == 'add':
            pid = str(mxpid)
            if len(arr) == 4:
                pid = arr[3]
                mxpid = max(mxpid, int(pid) + 1)
            else : mxpid += 1
            abstract = ""
            blogpath = os.path.abspath(os.path.join(os.path.dirname(__file__), ".." + arr[2]))
            with open(blogpath, "r", encoding = "utf-8") as f:
                abstract = f.read(100)
            bloginfo[pid] = {"title" : arr[1], "url" : arr[2], "abstract" : abstract, "mtime" : time.strftime("%Y-%m-%d %H:%M:%S", time.localtime(os.stat(blogpath).st_mtime))}
        elif arr[0] == 'del':
            del bloginfo[arr[1]]
    except (EOFError, KeyboardInterrupt):
        break
    
with open(os.path.abspath(os.path.join(os.path.dirname(__file__), "../blog/index.json")), "w", encoding = "utf-8") as f:
    json.dump(bloginfo, f, ensure_ascii = False, sort_keys = True, indent = 4)