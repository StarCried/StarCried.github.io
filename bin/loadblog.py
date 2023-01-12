import os,json

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
            with open(os.path.abspath(os.path.join(os.path.dirname(__file__), ".." + arr[2])), "r", encoding = "utf-8") as f:
                abstract = f.read(100)
                f.close()
            bloginfo[pid] = {"title" : arr[1], "url" : arr[2], "abstract" : abstract}
        elif arr[0] == 'del':
            del bloginfo[arr[1]]
    except (EOFError, KeyboardInterrupt):
        break
    
with open(os.path.abspath(os.path.join(os.path.dirname(__file__), "../blog/index.json")), "w", encoding = "utf-8") as f:
    json.dump(bloginfo, f, ensure_ascii = False)